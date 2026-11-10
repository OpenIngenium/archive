# Architecture

## Repository structure

```text
.
├── api/
│   ├── swagger.yaml        # Swagger 2.0 contract: paths, security, schemas (source of truth for the HTTP surface)
│   ├── base_funcs.js       # DB connection/bootstrap, ArangoDB graph primitives, logging, sanitization helpers
│   ├── node_funcs.js       # Execution/venue/logging business logic (depends on base_funcs + procedure_funcs)
│   └── procedure_funcs.js  # Procedure/procedure-version business logic (depends on base_funcs)
├── controllers/
│   ├── <Resource>.js        # Thin swagger-tools route handler: unpacks req.swagger.params, calls <Resource>Service
│   └── <Resource>Service.js # Business-logic adapter: validates/derives inputs, calls api/*_funcs.js, shapes HTTP response
├── tests/unit/
│   ├── api/                # Tests for base_funcs.js / node_funcs.js
│   ├── controllers/        # Tests for every *Service.js, plus controllers.delegation.test.js
│   └── mocks/              # testHelpers.js, mockDatabase.js, mockHttpClient.js (no real I/O)
├── config.js                # Environment-driven configuration (single source for env var access)
├── definitions.js           # ArangoDB collection/graph name constants + shared enums
├── index.js                  # Process entrypoint: Express + swagger-tools + JWT security + logging interceptor
├── Dockerfile                 # Production image build
└── .github/workflows/ci.yml   # GitHub Actions CI (test + docker build)
```

**Key relationship**: `controllers/*.js` never talk to the database directly. Every controller delegates to its matching `*Service.js`, and every service delegates to one or more of the three `api/*_funcs.js` modules, which are the only code that touches ArangoDB collections directly. This 4-layer separation (`controller → service → domain funcs → db`) is consistent across all ~20 resources (confirmed by `tests/unit/controllers/controllers.delegation.test.js`, which asserts every controller method forwards `req.swagger.params`, `res`, and `next` unchanged to its service).

## Component responsibilities

| Component | Responsibility | Depends on |
|---|---|---|
| `index.js` | Process bootstrap: connect/initialize DB, wire Express middleware (body parsing, response-logging interceptor, swagger metadata/security/validation/routing/UI), start HTTP server on port `8010` | `api/base_funcs.js`, `api/node_funcs.js`, `config.js`, `swagger-tools`, `jsonwebtoken` |
| `api/swagger.yaml` | Declares every HTTP path, method, parameters, required OAuth2 "scopes", and response schemas under `basePath: /api/v5`. Each path carries an `x-swagger-router-controller` value that `swagger-tools` uses to route to the matching file in `controllers/` | none (data file) |
| `controllers/<Resource>.js` | One exported function per `operationId` in `swagger.yaml`. Purely forwards `(req.swagger.params, res, next[, req.headers])` to the same-named function in `<Resource>Service.js` | `controllers/<Resource>Service.js` |
| `controllers/<Resource>Service.js` | Extracts typed args from swagger params (`args['x']['value']`), calls the relevant `api/node_funcs.js` / `api/procedure_funcs.js` function, maps the result/rejection to an HTTP status + JSON body | `api/base_funcs.js`, `api/node_funcs.js` and/or `api/procedure_funcs.js` |
| `api/base_funcs.js` | Owns the `arangojs` `db` handle and every collection reference; DB bootstrap (`init_db`/`reset_db`); the Winston `log`; generic **graph algorithms** shared by both procedures and executions (`getStructure`, `getElement`, `getElementsAndEdges`, `addElement`, `moveElement`, `copyElement`, `deleteElement`, `update_number`, …); JWT decode helper `getUserName`; error-shaping helper `push_error` | `arangojs`, `definitions.js`, `config.js`, `jsonwebtoken`, `winston` |
| `api/node_funcs.js` | Execution-specific and venue-specific business logic: `createExecution`, `updateExecutionStatus`, `addElement`/`modifyElement`/`discardElements` (redlining), step I/O (`setStepInput`, `setStepOutput`, `createNewRun`), procedure-section import (`importProcedureSection`), venues/venue groups, logging-level endpoints, comments/files on executions, execution export/import | `api/base_funcs.js`, `api/procedure_funcs.js`, `definitions.js`, `config.js` |
| `api/procedure_funcs.js` | Procedure-specific business logic: CRUD on procedures, procedure **version** lifecycle (`createProcedureVersion`, `updateProcedureVersionStatus`, `deleteProcedureVersion`), tags, procedure labels, comments/files on procedure elements, procedure export/import | `api/base_funcs.js`, `definitions.js`, `config.js` |
| `definitions.js` | Single source of truth for ArangoDB collection names, graph names, and the enums shared across layers (`ProcedureModificationStatus`, `ProcedureModificationType`, `CommentType`, `CommentStatus`) | none |
| `config.js` | Resolves every environment variable exactly once into a plain module export | `process.env` |

## Request lifecycle

Every incoming HTTP request passes through the following Express/`swagger-tools` middleware chain, registered in `index.js` in this exact order:

```mermaid
sequenceDiagram
    participant C as Client
    participant BP as body-parser
    participant IC as express-interceptor
    participant MD as swaggerMetadata()
    participant SEC as swaggerSecurity(UserSecurity)
    participant VAL as swaggerValidator()
    participant RT as swaggerRouter()
    participant CTL as controllers/*.js
    participant SVC as controllers/*Service.js
    participant FN as api/node_funcs.js or procedure_funcs.js

    C->>BP: HTTP request (JSON body up to 500mb)
    BP->>IC: parsed body
    IC->>MD: pass through (records response for later logging)
    MD->>SEC: attaches req.swagger (apiPath, operation, params)
    SEC->>SEC: decode+verify JWT (RS256) against PUBLIC_PEM;<br/>intersect token scopes with operation's required scopes
    alt no/invalid token
        SEC-->>C: 401 / 403 JSON error
    else authorized
        SEC->>VAL: cb(null)
        VAL->>VAL: validate request against swagger.yaml schema
        alt validation fails
            VAL-->>C: 400 {message, details} (custom error handler)
        else valid
            VAL->>RT: routed by x-swagger-router-controller + operationId
            RT->>CTL: controller function(req, res, next)
            CTL->>SVC: Service.<op>(req.swagger.params, res, next)
            SVC->>FN: domain function call(s)
            FN-->>SVC: Promise resolve/reject
            SVC-->>C: res.status(code).json(body)
        end
    end
    IC->>IC: on POST/PUT/PATCH/DELETE with a matched swagger operation,<br/>log request outcome (user, event, execution_id/procedure_id/elem_id, status)
```

Notes grounded in `index.js`:
- The `express-interceptor` is registered **before** the swagger middleware, but its `intercept()` callback fires after the response body has been produced; it inspects `req.swagger.operation` (only populated for matched swagger routes) and logs via `log.info`/`log.error` depending on `res.statusCode`.
- `swaggerSecurity` is a single named security handler, `UserSecurity`, referenced by `securityDefinitions.UserSecurity` in `api/swagger.yaml`. If an operation declares `security: - UserSecurity: []` (empty scope list — used by `/health`), the handler calls back immediately without checking the token.
- Schema-validation failures are caught by a dedicated error-handling middleware at the end of the chain (`err.failedValidation` → HTTP 400 with `{message, details}`); all other passed-through errors are forwarded to Express's default handler.
- Swagger UI (`middleware.swaggerUi()`) is mounted automatically by `swagger-tools`, exposing interactive docs at `/docs`.

See [Security](./Security.md) for the authentication/authorization details and [Error Handling & Logging](./Error-Handling-and-Logging.md) for how errors and logs are shaped.

## Controller/Service pairing (all 20 resources)

Confirmed by `tests/unit/controllers/controllers.delegation.test.js`, which parametrizes over this exact list:

`Health`, `Logging`, `Comment`, `Execution`, `File`, `Paragraph`, `ProcSection`, `Procedure`, `ProcedureComment`, `ProcedureFile`, `ProcedureParagraph`, `ProcedureProcSection`, `ProcedureSection`, `ProcedureStep`, `ProcedureVersions`, `Procedures`, `Section`, `Step`, `Venue`, `VenueGroup`.

Each has a `controllers/<Name>.js` (route handler) and `controllers/<Name>Service.js` (logic adapter). Note the naming distinction: `Procedure.js`/`ProcedureService.js` handles operations on a **single procedure and its elements**, while `Procedures.js`/`ProceduresService.js` (plural) handles the **procedure list/search** endpoint. Similarly `ProcedureVersions.js` (plural) manages the version collection for a procedure. See [Core Components](./Core-Components.md) for what each module actually does.

## Why a graph database

`api/base_funcs.js` models both procedures and executions as ArangoDB **named graphs** (`execution_graph`, `procedure_graph`) whose vertices are "elements" (sections/procedure-sections/paragraphs/steps) and whose edges (`stepOrder` collection) encode parent→child ordering via an `idx` attribute on each edge. Reading a procedure/execution ("get structure") is implemented as a single AQL graph traversal (`FOR vertex, edge IN 0..10000 OUTBOUND '<root>' GRAPH '<graph_name>' OPTIONS {bfs: true} ...`) rather than N recursive queries. See [Data Model](./Data-Model.md) and [Data Flows](./Data-Flows.md) for the concrete traversal and mutation algorithms. The repository does not document *why* ArangoDB specifically was chosen over another graph or document store — this is unknown/not documented.
