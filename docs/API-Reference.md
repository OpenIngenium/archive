# API Reference

The full, authoritative contract is `api/swagger.yaml` (Swagger 2.0), served live as interactive docs at `GET /docs` (Swagger UI). This page is a navigable map over that contract plus the scope/authorization rules that `index.js` enforces on top of it — it intentionally does not re-list every one of the ~150 operations; use `/docs` or search `api/swagger.yaml` by `operationId` for exact request/response schemas.

- Base path: `/api/v5` (`basePath` in `api/swagger.yaml`; also `config.api_version = 'v5'`)
- Content type: `application/json` for all operations except file upload (`multipart/form-data`)
- Every operation requires `Authorization: Bearer <jwt>` **except** `GET /health`, which declares `security: - UserSecurity: []` (empty scope list). See [Security](./Security.md) for how the token is verified and how scopes are matched.

## Resources and their controller pair

Each row is one `x-swagger-router-controller` value in `api/swagger.yaml`, implemented by the matching `controllers/<Name>.js` + `<Name>Service.js` pair.

| Resource (swagger tag / controller) | Root path(s) | Typical required scope(s) | What it covers |
|---|---|---|---|
| `Execution` | `/executions`, `/executions/{execution_id}`, `/executions/{execution_id}/elements/...` | `execute:wsts`\|`execute:testbed`\|`execute:sit`\|`execute:other` for mutations; unrestricted read (any of the 10 default scopes) for `GET` list/detail | Create/get/list/delete/export/import executions; update execution status; add/move/copy/discard elements; get as-run report, outline, history, next element, boundary element |
| `Step` | `/executions/{execution_id}/steps/{elem_id}[...]` | `execute:*` | Get/update a step, get/update its input, get/update its result, create a new run (`create_new_run`) |
| `Comment` | `/executions/{execution_id}/elements/{elem_id}/conversations[...]` | `basic` | Conversations and comments attached to an execution element |
| `File` | `/executions/{execution_id}/elements/{elem_id}/files[...]`, `/executions/{execution_id}/files[...]` | `execute:*` | Upload/get/delete files attached to an execution element, a comment, or the execution itself |
| `Section` | `/executions/{execution_id}/sections[...]` | `execute:*` | Plain sections within an execution |
| `ProcSection` | `/executions/{execution_id}/procedure_sections[...]` | `execute:*` | Procedure-section placeholders: get input/structure/elements, **import** a referenced procedure's elements |
| `Paragraph` | `/executions/{execution_id}/paragraphs[...]` | `execute:*` | Free-text paragraph elements within an execution |
| `Procedure` (singular) | `/procedures/{procedure_id}/elements[...]`, `/...tags`, `/...load_working_copy`, `/...export`/`import_version` | `author` (mutations); `admin` for `delete_procedure` | Element CRUD/move/copy/replace within a procedure's working copy; tags; working-copy reload/import/export |
| `Procedures` (plural) | `/procedures` | `author` for `create_procedure`; default scopes for list | Search/list procedures (`getProcedures` filters — see [Core Components](./Core-Components.md)); create a procedure |
| `ProcedureVersions` | `/procedures/{procedure_id}/versions[...]` | `author` for create/update; `admin` for delete; `author`\|`imcm`\|`admin`\|`test_lead` for `update_version_status` | Version CRUD, version structure/elements/outline, status transitions (submit/approve/release/obsolete — see [Data Model](./Data-Model.md#procedure-version-lifecycle)) |
| `ProcedureSection`, `ProcedureProcSection`, `ProcedureStep`, `ProcedureParagraph`, `ProcedureComment`, `ProcedureFile` | `/procedures/{procedure_id}/...` | `author` | Procedure-scoped equivalents of the execution-scoped `Section`/`ProcSection`/`Step`/`Paragraph`/`Comment`/`File` resources, operating on the working copy's element tree |
| `Venue` | `/venues[...]` | `admin` for create/update/delete; `admin`+`execute:*` for `set_venue_status` (see note below); default scopes for read | Venue CRUD, venue status |
| `VenueGroup` | `/venue_groups[...]` | `admin` | Venue group CRUD |
| `Logging` | `/logging` | default scopes for `GET`; `admin` for `PATCH`/update | Read/update the live Winston log level |
| `Health` | `/health` | none (empty scope list) | Liveness/readiness probe |

**Documented rationale** (comment in `api/swagger.yaml` next to `set_venue_status`): execute scopes are intentionally allowed on `set_venue_status` — not just `admin` — *"since Core will need to set the venue status to IN_USE when an execution is started. The same API in Core allows only 'admin' scope."* This is one of the few explicit design-rationale comments in the repository, referencing the separate "Ingenium Core" service.

## Common query parameters

Defined once under `parameters:` in `api/swagger.yaml` and reused via `$ref` across nearly every list endpoint:

| Parameter | Default | Notes |
|---|---|---|
| `offset` | `0` | Zero-based pagination start |
| `limit` | `50` | Max rows returned |
| `sort` | — (endpoint-specific) | `ASC` or `DESC` |
| `sort_by` | — | Enum varies per resource (e.g. executions: `EXECUTION_ID`, `TIME_STARTED`, `TIME_COMPLETED`, `VENUE_NAME`, `STATUS`) |
| `elem_type` | — | `SECTION`, `PROCEDURE_SECTION`, `PARAGRAPH`, `STEP` |
| `step_type` | — | One of the ~28 step types declared in `api/swagger.yaml` (`MANUAL_INPUT`, `MANUAL_EIP`, `VENUE_CONFIG_MANUAL`, `ENVIRONMENT_MANUAL`, `GDS_MANUAL`, `VERIFICATION_ITEM`, `VERIFICATION_ITEM_STATUS`, `GRAPH_EHA`, `QUERY_EVR`, `VERIFY_EHA`, `WAIT_EHA`, `WAIT_EVR`, `BUS_1553`, `LIST_DATA_PRODUCTS`, `WAIT_DATA_PRODUCTS`, `CMD`, `CMD_FILE`, `CMD_SCMF`, `CMD_SSE`, `VENUE_CONFIG_GET`, `VENUE_CONFIG_UPDATE`, `VENUE_CONFIG_CHECK`, `MANUAL_VERIFICATION`, `CUSTOM_SCRIPT`, `ANALYSIS`, `WAIT`, `TIME_REFERENCE`, `TOC`) |
| `all_elements`, `comment_filter`, `ar_comment_filter`, `dr_comment_filter` | `OFF` | Filter element lists by comment/report presence |

List endpoints that use these filters return the page of results in the JSON body and the total match count in the `x-total-count` response header (see e.g. `controllers/VenueService.js#get_venues`, `controllers/ProceduresService.js#get_procedures`).

## Example: create and run an execution

```bash
# 1. Create an execution against a venue (requires an execute:* scope)
curl -X POST http://localhost:8010/api/v5/executions \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"venue_id": "your-venue-id"}'

# 2. Add a step to it
curl -X POST "http://localhost:8010/api/v5/executions/<execution_id>/steps?insert_after_id=-1" \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"step": {"elem_type": "STEP", "step_type": "MANUAL_INPUT", "title": "My step"}}'

# 3. Check health (no auth required)
curl http://localhost:8010/api/v5/health
```

The `venue_id` requirement and `execute:*` scope for `create_execution` are enforced in `api/node_funcs.js#createExecution` (rejects if the venue does not exist or is `IN_USE`/`DOWN`) and `api/swagger.yaml`'s per-operation `security:` block, respectively (see [README's Quick Start](../README.md#quick-start) for the equivalent `curl` example against `/health`).

## Response/error shape

Nearly every mutating operation returns either:
- `200`/`204` with the resource (or nothing, for `204`) on success, or
- `400` (occasionally `403`/`404`) with a body shaped by `api/base_funcs.js#push_error`: `{"message": "...", "details": [...]}`.

See [Error Handling & Logging](./Error-Handling-and-Logging.md) for exactly how that body is constructed and [Core Components](./Core-Components.md#controllersresourcejs--controllersresourceservicejs-pattern) for the controller/service code pattern behind every operation.
