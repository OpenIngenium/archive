# Data Flows

End-to-end walkthroughs of the most important workflows, traced through actual functions and files. See [Data Model](./Data-Model.md) for the underlying schema and [Core Components](./Core-Components.md) for what each function does in isolation.

## Create an execution

```text
POST /executions {venue_id}
→ controllers/Execution.js#create_execution
→ controllers/ExecutionService.js#create_execution        (extract args['execution']['value'])
→ api/node_funcs.js#createExecution
    → venue_collection.lookupByKeys([venue_id])             — reject if not found / more than one match
    → reject if venue_status.status is IN_USE or DOWN
    → execution_id_gen_collection.save({})                  — allocate autoincrement key
    → execution_id = config.execution_id_prefix + key       (default "clipper-ingenium-<n>")
    → merge a large default metadata template (status: IDLE, mode: MANUAL, pause_conditions, empty counts, ...)
      with the caller's input via extend(true, {}, defaults, execution_input)
    → execution_collection.save(execution)
→ 200 {ExecutionInfo}
```

Rejections at any step (venue not found, venue unavailable, DB write failure) become a `400` with a `push_error`-shaped body (see [Error Handling & Logging](./Error-Handling-and-Logging.md)).

## Add a step to an execution

```text
POST /executions/{execution_id}/steps {step, insert_after_id, level}
→ controllers/ExecutionService.js#create_execution_step
    → node_funcs.checkExecutionClosed(execution_id, "...")   — reject if status is CLOSED/IN_REVIEW/FINALIZED
    → node_funcs.addElement(execution_id, step, insert_after_id, level)
        → reject if execution.status !== 'IDLE'
        → base_funcs.addElement('EXECUTION', execution_id, step, insert_after_id, level)
            → locate target parent + target_idx (get_target_idx: "-1"→front, CHILD→0, SIBLING→after insert_after_id)
            → assign new elem_id/_key, save the element document
            → save a stepOrder edge {_from: parent, _to: new element, idx: target_idx}
            → re-index sibling edges after the insertion point (update_idx_for_edges)
            → update_number() to recompute the `number` string for every affected sibling/descendant
→ 200 {AddStepResponse: elem, numbers, elem_ids}
```

Both the `checkExecutionClosed` guard and the `status !== 'IDLE'` guard exist independently — an execution can be `IDLE` but still closed-adjacent in ways `addElement` alone doesn't check, so both call sites are exercised for structural mutations (`addElement`, `moveElement`, `copyElement`, `modifyElement`, `deleteElement` all repeat the `status !== 'IDLE'` check individually in `api/node_funcs.js`).

## Import a procedure section

A `PROCEDURE_SECTION` element in an execution can reference another procedure's version and, when **not** `callable`, be **imported** — its selected elements are copied wholesale into the execution as real, editable elements.

```text
POST /executions/{execution_id}/procedure_sections/{elem_id}/import
→ controllers/ProcSectionService.js  (not detailed — delegates straight through)
→ api/node_funcs.js#importProcedureSection(elem_id)
    → base_funcs.getElement('EXECUTION', elem_id)                — the procedure-section element itself
    → reject if elem_type !== 'PROCEDURE_SECTION'
    → reject if execution_user_input.callable === true            ("Should be called instead")
    → reject if procedure_section.imported === true                (cannot import twice)
    → run_for_score = base_funcs.isInRunForScore(elem_doc)         (inherited from an ancestor, if any)
    → procedure_funcs.getProcedureVersion(reference_procedure_id, reference_procedure_version)
    → base_funcs.getElementsAndEdges('PROCEDURE', version_doc._id) — flat {elems, step_order_edges}
    → delete any existing children of the procedure-section (idempotent re-import guard)
    → for each procedure element: assign a new elem_id, retarget to the execution
      (execution_id, procedure_section_id, procedure_modification_status=ORIGINAL, run_for_score),
      merge authoring_user_input → execution_user_input (with step-type-specific overrides for
      CUSTOM_SCRIPT / MANUAL_EIP / GDS_MANUAL), reset conversations
    → remap step_order_edges to the new elem_ids, re-index idx (update_idx_for_edges)
    → element_collection.update(elem_id, {imported: true})
    → element_collection.import(elems_copy) + step_order_collection.import(step_order_edges_copy)  (bulk insert)
→ returns the imported subtree (base_funcs.getElements('EXECUTION', 'element/<elem_id>', ...))
```

This is the same `prepareElementForCopy`-style remap pattern used by procedure versioning (below), specialized for the procedure→execution direction. See [Data Model](./Data-Model.md#procedure-vs-execution-parallel-but-separate-collections).

## Redline a step (`modifyElement`)

```text
POST /executions/{execution_id}/elements/{elem_id}/modify
→ api/node_funcs.js#modifyElement(execution_id, elem_id)
    → reject if execution.status !== 'IDLE'
    → fetch elem; reject unless procedure_modification_status is ORIGINAL (and run_for_score) or MODIFIED
    → reject if elem_type === 'SECTION' (sections are never redlined)
    → locate the parent edge (step_order_collection.byExample({_to: elem_idd}))
    → create a new element (new uuid) with procedure_modification_status = MODIFYING,
      insert it as a sibling right after the original
    → mark the original element MODIFIED (or the previous MODIFYING → MODIFYING_OLD, if this is a
      re-redline of an already-redlined element)
    → update_number() to assign the new element a dotted-letter number (e.g. "2-1.a")
→ 200 {ModifyElementResponse: elem, numbers, elem_ids}
```

To undo, `POST .../discard` (`api/node_funcs.js#discardElements`) reverses the status back toward `ORIGINAL`/removes the `ADDED`/`MODIFYING` element, per the state machine in [Data Model](./Data-Model.md#redlining-procedure_modification_status).

## Create a new version of a procedure

```text
POST /procedures/{procedure_id}/versions {version_meta_data}
→ controllers/ProcedureVersionsService.js#create_version
    → procedure_funcs.getProcedure(procedure_id)
    → procedure_funcs.getProcedureVersion(procedure_id, 0)          — the working copy
    → procedure_funcs.createProcedureVersion(procedure_doc, version_meta_data, working_version)
        → next_version = getProcedureLatestVersion(procedure_id) + 1
        → build version_info (status: 'VERSIONED', time_versioned: now, tags reassigned to fresh
          tag_ids via _reassignTagIds), merged over a copy of working_version's metadata (files, etc.)
        → procedure_version_collection.save(version_info) + hasVersion edge (procedure → new version)
        → base_funcs.getElementsAndEdges('PROCEDURE', workingCopy._id)  — snapshot current working elements
        → remap every element to a fresh elem_id/_key under the new version_id, update tag_ids via
          _updateTagIds(elems_copy, tag_id_map)
        → procedure_element_collection.import(elems_copy) + procedure_step_order_collection.import(edges)
        → recompute procedure.current_version / current_released_version
→ 200 {ProcedureVersionInfo}
```

The working copy (version 0) is **left untouched** — versioning is a copy-out, not a move. Status transitions after this (`SUBMIT`/`APPROVE`/`RELEASE`/`OBSOLETE`) are handled by `updateProcedureVersionStatus`, documented in [Data Model](./Data-Model.md#procedure-version-lifecycle).

## Delete an execution (cascading graph delete)

```text
DELETE /executions/{execution_id}
→ api/node_funcs.js#deleteExecution(execution_id)
    → execution_collection.lookupByKeys([execution_id])   — reject if not found / ambiguous
    → AQL: FOR vertex, edge IN 1..10000 OUTBOUND 'execution/<id>' GRAPH 'execution_graph'
           OPTIONS {bfs: true} RETURN {v_id, v_key, e_id, e_key}
    → partition results into elem_keys (element/*), step_order_keys (stepOrder/*), run_record_keys (runRecord/*)
      (anything else logs a "Unrecognized element/edge type" warning rather than failing)
    → execution_collection.removeByKeys([execution_id])
    → element_collection.removeByKeys(elem_keys)
    → step_order_collection.removeByKeys(step_order_keys)
    → run_record_collection.removeByKeys(run_record_keys)
→ 204
```

There is no soft-delete/tombstone — this is a hard, cascading delete of the entire subtree in one traversal plus four bulk removes. The equivalent for a subtree under an execution (rather than the whole execution) is `api/node_funcs.js#deleteElement` → `api/base_funcs.js#deleteElement`, which walks children recursively in-memory (via the already-fetched `getStructure` tree) instead of issuing a second AQL traversal, and additionally enforces the redline-protection rule described in [Data Model](./Data-Model.md#redlining-procedure_modification_status).

## Move vs. copy vs. import — when each is used

| Operation | Function | Source root | Target root | Elem IDs |
|---|---|---|---|---|
| Reorder within the same execution/procedure | `moveElement` | same as target | same | **unchanged** — only edges are rewritten |
| Duplicate within/between executions or from a procedure version | `copyElement` | execution or procedure version (`source_execution_id` or `source_procedure_id`+`source_procedure_version`) | execution or procedure | **regenerated** via `prepareElementForCopy` |
| Pull a procedure's elements into a `PROCEDURE_SECTION` placeholder | `importProcedureSection` | procedure version | execution | **regenerated**, plus `procedure_section_id`/`procedure_modification_status=ORIGINAL` stamped on |
| Snapshot the working copy into an immutable version | `createProcedureVersion` | procedure (working copy) | same procedure, new version | **regenerated** |

All "regenerate IDs" paths ultimately route through `api/base_funcs.js#prepareElementForCopy` (for `copyElement`) or an equivalent inline remap loop (for `importProcedureSection` / `createProcedureVersion`) — the pattern (new uuid → new `_key`/`_id` → delete old `_id` → track old→new in a dict → rewrite edges using that dict) is consistent across all three.
