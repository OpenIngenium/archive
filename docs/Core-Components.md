# Core Components

This page documents the three `api/*.js` modules and the `controllers/*Service.js` pattern in more detail than [Architecture](./Architecture.md). See [Data Model](./Data-Model.md) for the schema these functions operate on.

## `api/base_funcs.js` — shared DB access, graph primitives, logging

**Role**: the only module that opens the ArangoDB connection and holds collection handles. Everything else (`node_funcs.js`, `procedure_funcs.js`, every `*Service.js`) requires this module (directly or transitively) to reach the database or the logger.

### Bootstrap
- `db = arangojs(config.db_url)` at module load; `db.useDatabase(database_name)` / `db.useBasicAuth(...)` immediately after.
- `init_db()` — called once from `index.js` at process start. Polls `get_db_list(count, milisecs)` (retries `listUserDatabases()` up to `count` times, sleeping `milisecs` between attempts — used to wait for ArangoDB to become reachable on container startup) then, if the `ingenium` database does not exist, creates it, creates the three named graphs, the two autoincrement ID-generator collections, and seeds a `Default` venue group. If the database already exists, it just switches to it — **it does not migrate schema**.
- `reset_db()` — drops and recreates the `ingenium` database. Exported but not called anywhere in `index.js`; **strong inference**: intended for test/dev tooling outside this repository, or manual invocation via a REPL/script.

### Logging (`log`)
- Custom Winston levels (lowest→highest severity is *not* numeric-ascending; note the levels object): `critical: 0, error: 1, warning: 2, info: 3, debug: 4, trace: 5` — i.e. `critical` is most severe, `trace` is most verbose, matching Winston's convention that lower numbers are logged at higher priority.
- `json_formatter` always emits `{timestamp, level, message, ...meta}`; if the second argument to a log call is a plain object with properties, those properties are merged directly into the JSON log line (this is how `index.js`'s interceptor attaches `user_name`, `event`, `execution_id`, etc. to each request log).
- Transports: always `Console`; additionally a rotating `File` transport (`maxsize: 5MB`, `maxFiles: 2`) if `LOG_FILE_PATH` is set.
- Level is read once from `LOG_LEVEL` at startup but is **mutable at runtime** via `PATCH /logging` (see `node_funcs.js#updateLogging`, which does `log.level = logging_info.level.toLowerCase()`).

### Graph primitives (used by both `node_funcs.js` and `procedure_funcs.js`)

| Function | Purpose |
|---|---|
| `get_root_specific_variables(root_type)` | Returns a bag of `EXECUTION`- or `PROCEDURE`-specific constants (graph name, id prefixes, collection handles, which JSON field holds user input) so the rest of the graph code can be written once and parameterized by `root_type` instead of duplicated |
| `getStructure(root_type, root_idd, simple)` | Single AQL BFS traversal from `root_idd` (an execution/procedure-version id **or** any element id) returning the full nested JSON tree (`children`, `run_records`). `simple=true` projects only the fields needed for outline/summary views |
| `getVerticesEdges(root_type, root_idd)` | Same traversal, but returns flat `{vertices, edges}` arrays instead of a nested tree — used when the caller needs to bulk-copy or bulk-delete rather than render |
| `getElement(root_type, elem_id)` / `getElementSanitized` | Fetch a single element document by key; sanitized variant strips ArangoDB internal attrs (`_id`,`_key`,`_rev`) |
| `getElements(root_type, root_idd, elem_type, step_type, description, ...)` | Flattened, filterable list of elements under a root (built by walking the tree from `getStructure` and filtering — see `collectElementList`) |
| `addElement(...)` | Inserts a new element as sibling/child of `insert_after_id`, computing its `idx`/edge and renumbering affected siblings via `update_number` |
| `moveElement` / `copyElement` | Relocate or duplicate a subtree, rewriting edges (`prepare_sibling_edges`, `get_target_idx`) and, for copy, remapping every descendant `elem_id` (`prepareElementForCopy`) |
| `deleteElement(root_type, elem_id, check_redline)` | Recursively collects every descendant vertex/edge (`delete_vertex`) then removes them; `check_redline` gates the *"cannot delete a redline element"* rule described in [Data Model](./Data-Model.md#redlining-procedure_modification_status) |
| `update_number(root_type, elem, number, start_idx, ...)` | Recomputes the human-readable `number` string for an element and all descendants after any structural change; encodes the redline dotted-letter/dotted-number numbering rules |
| `sanitizeElement` / `sanitize_internal_attrs(_recursive)` | Strip internal/transient fields (`idx`, `parent_idd`→`parent_id` rewrite, `_version`) before returning a document over HTTP |
| `sortChildren` | Recursively sorts a nested tree's `children`/`run_records` by `idx`; also logs `INCONSISTENT ELEMENT ORDER` if a gap/duplicate is detected — the only integrity self-check present in the codebase |
| `prepareElementForCopy` | The single shared implementation behind procedure→execution import, execution copy, and procedure versioning (see [Data Model](./Data-Model.md#procedure-vs-execution-parallel-but-separate-collections)) |
| `getProcedureModificationTemplate` / `isRedlineElement` / `isInRunForScore` | Redline-status helpers reused by `node_funcs.js` |
| `getUserName(authorization_header)` | Decodes the bearer JWT (`jwt.verify(..., public_pem, {algorithms:['RS256']})`) and returns its `username` claim, or `''` if absent/no header. Used for audit fields (e.g. `transitions[].user_name` in `updateExecutionStatus`) |
| `push_error(message, err)` | Normalizes any thrown value (`Error`, string, ArangoDB error object) into `{message, details: [...]}` for a consistent HTTP error body — see [Error Handling & Logging](./Error-Handling-and-Logging.md) |
| `get_sj_error_message(err)` | Extracts a human-readable string from an `arangojs` HTTP error (`err.response.body.errorMessage`), falling back to `util.inspect(err)` |

## `api/node_funcs.js` — execution, venue, and logging logic

**Role**: everything that operates on an **execution** as the root object, plus venue/venue-group management and the two logging endpoints. Requires `base_funcs.js` for graph/DB access and `procedure_funcs.js` for reading procedure data (e.g. when importing a procedure section or creating a step from a procedure's step specification).

Representative functions (grouped by concern):

- **Execution lifecycle**: `createExecution` (validates venue exists and is not `IN_USE`/`DOWN`, allocates `execution_id`, seeds a large default metadata document — see the `executionEmpty` template in the source), `getExecution(Full)`, `updateExecution`, `updateExecutionStatus` (appends to `execution.transitions[]`, closes out `current_step_*` fields when transitioning to `CLOSED`), `deleteExecution` (cascading graph delete via a raw AQL traversal + `removeByKeys`).
- **Element/step mutation**: `addElement`, `moveElement`, `copyElement`, `deleteElement`, `updateElement`, `modifyElement` (redline creation), `discardElements` (redline reversal), `checkExecutionClosed` (guard used before most mutating operations — rejects if execution is `CLOSED`, `IN_REVIEW`, or `FINALIZED`).
- **Step execution**: `setStepInput`, `setStepOutput` (guards against overwriting a completed step; uses ArangoDB optimistic concurrency (`{'rev': rev_current}`) for intermediate results, with a 3-attempt retry loop for final results), `createNewRun` (snapshots the current step into a `run_records` entry before resetting it for re-execution), `getStepExecutionHistory` (flattens and time-sorts every executed step + run-record across an execution).
- **Procedure-section import**: `importProcedureSection` — see [Data Flows](./Data-Flows.md#import-a-procedure-section).
- **Venues**: `createVenue`, `getVenues` (dynamic AQL filter builder, same pattern as `procedure_funcs.js#getProcedures`), `getVenue`, `updateVenue`, `updateVenueStatus`, `deleteVenue`, plus `VenueGroup` equivalents.
- **Comments/files on execution elements**: `add/get/update/deleteConversation`, `add/get/update/deleteComment`, `add/get/deleteFile`, `add/get/deleteCommentFile` — the execution-side counterparts of the same operations in `procedure_funcs.js`.
- **Export/import**: `exportExecution`/`importExecution` — serialize/restore an execution's full element graph, mirroring `procedure_funcs.js#exportProcedureVersions`/`importProcedureVersions`.
- **Auth helpers duplicated here**: `parse_username`/`parse_token` — thin JWT helpers used by `index.js`'s response-logging interceptor (kept separate from `base_funcs.js#getUserName`, which does the same decode for a different caller).

## `api/procedure_funcs.js` — procedure and version logic

**Role**: everything that operates on a **procedure** or **procedure version** as the root object, plus tags and procedure labels.

- **Procedure CRUD/search**: `createProcedure` (allocates `procedure_id`, immediately calls `createProcedureVersion(doc, null, null)` to seed the working copy), `getProcedures` (dynamic AQL filter builder supporting `title`/`description`/`procedure_id`/`institutional_id`/`author`/`versioned`/`procedure_type`/`hazardous`/`label`/`released`/`obsolete` filters, `sort`/`sort_by`, offset/limit, and returns `{data, total_count}` using ArangoDB's `fullCount` cursor stat), `getProcedure`, `updateProcedure`, `deleteProcedure`.
- **Version lifecycle**: `createProcedureVersion`, `getProcedureVersion(s)`, `updateProcedureVersion`, `updateProcedureVersionStatus`/`deriveVersionStatus`, `deleteProcedureVersion`, `loadToWorkingCopy`/`importProcedureVersion` (both delegate to an internal `_loadWorkingCopy`), `getProcedureCurrentVersion`/`getProcedureCurrentReleasedVersion`. See [Data Model](./Data-Model.md#procedure-version-lifecycle) for the state machine this implements.
- **Tags**: `procedureCreateTag`/`procedureUpdateTag`/`procedureDeleteTag` (tags live on the working-copy version document, `version_info.tags[]`); `procedureElementApplyTag`/`procedureElementRemoveTag` (mutate `tag_ids[]` on one or more elements, always re-fetched via `getElements` with a single-element filter so the same batch-update code path (`updateElements`) is reused for one element or many).
- **Procedure-scoped comments/files/labels**: same shape as the execution-side equivalents in `node_funcs.js`.
- **Export/import**: `exportProcedureVersions(procedure_id, version, released_only)` — collects the procedure's metadata plus the selected version(s)' elements/edges via `getVerticesEdges`, tagging each edge with its `edge_collection_name` so a later `importProcedureVersions` can reconstruct the right edge collection; `importProcedureVersions(import_input)` — upserts the procedure, replaces any version that already exists at the same version number (`deleteProcedureVersion(..., true)`), then bulk-`import()`s versions, `hasVersion` edges, elements, and `procedureStepOrder` edges.

## `controllers/<Resource>.js` + `controllers/<Resource>Service.js` pattern

Every resource follows the same two-file pattern. Example (`controllers/Health.js` / `controllers/HealthService.js` — the simplest instance):

```js
// controllers/Health.js
var Health = require('./HealthService');
module.exports.health_get = function health_get (req, res, next) {
  Health.health_get(req.swagger.params, res, next);
};
```

```js
// controllers/HealthService.js
exports.health_get = function(args, res, next) {
  let response = { 'status': 'OK', 'message': '' };
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(response);
}
```

A more representative example, `controllers/ExecutionService.js#create_execution`, shows the standard success/error shape used by nearly every service function in the codebase:

```js
exports.create_execution = async function(args, res, next) {
  let executionInput = args['execution']['value'];
  try {
    const data = await node_funcs.createExecution(executionInput);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when creating an execution', err);
    res.status(400).json(err_data);
  }
}
```

This pattern — extract `args[name]['value']`, `await` a single domain function, `res.status(200).json(data)` on success or `res.status(400).json(push_error(...))` on rejection — is repeated with minor variation (different status codes for `create`=200, `delete`=204, `get`=200/404; a few venue endpoints propagate a caller-specified `err_obj.error_code` instead of hardcoding 400) across all ~150 operations. Understanding this one pattern is sufficient to read any `*Service.js` file. See [API Reference](./API-Reference.md) for the full resource list and [Error Handling & Logging](./Error-Handling-and-Logging.md) for the error-shape contract.
