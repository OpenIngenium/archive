# Troubleshooting

This page only documents failure modes that can be established from the code, configuration, or explicit comments in this repository. It intentionally does not speculate about production incidents, since none are recorded here.

## "api key was not provided" (`401`)

`index.js`'s `swaggerSecurity` handler returns this when the operation requires a scope and the request has no `Authorization` header, or the header doesn't start with `Bearer ` (case-insensitive). Check that the client sends `Authorization: Bearer <token>` and that the operation isn't accidentally hitting a path that requires auth when you expected `/health`-style anonymous access (only `/health` has an empty required-scopes list — see [Security](./Security.md)).

## "access denied: ..." (`403`) on every authenticated request

`jwt.verify(token, public_pem, {algorithms:['RS256']})` threw. Most common root cause, directly implied by `config.js`: **`PUBLIC_PEM` is unset**, defaulting to `''`, so no token can ever verify successfully (see [Configuration](./Configuration.md#required-vs-optional-in-practice)). Confirm `PUBLIC_PEM` is exported in the environment the process actually sees, and that the token was signed with the matching private key using RS256.

## "user does not have the permission" (`403`)

The token verified, but none of its `scopes` intersect the operation's required scopes (see [Security](./Security.md#authorization-scopes)). Check the token's `scopes` claim shape — the code accepts either an array of strings or an array of `{scope: "..."}` objects; if the issuer emits a different shape, `scope_names` will end up empty and every check will fail. Cross-reference the required scopes for the specific operation in `api/swagger.yaml` (or the summary table in [API Reference](./API-Reference.md)).

## Service starts but never logs "Your server is listening..."

`index.js` calls `base_funcs.init_db()` before creating the HTTP server; if ArangoDB is unreachable, `get_db_list` retries 10 times at 4-second intervals and then rejects, and the top-level `.then(..., (err) => log.error(err))` handler only logs the error — **it does not exit the process**, so the container/process will appear "up" but never actually bind port `8010`. Check connectivity/credentials against `ARANGODBURL`/`ARANGO_USER`/`ARANGO_ROOT_PASSWORD` (see [Configuration](./Configuration.md)) and check the logs for `Trying to connect to DB at ...` / `Failed to connect db: ...` (from `api/base_funcs.js#get_db_list`).

## `400 Failed schema validation`

This specific message means the request never reached your controller/service code — `swagger-tools`' `swaggerValidator()` rejected it against the schema in `api/swagger.yaml` before routing. The `details` array in the response body contains the raw validation error as a JSON string; inspect it for the exact field/type mismatch (see [Error Handling & Logging](./Error-Handling-and-Logging.md#schema-validation-errors-swagger-layer)). This is distinct from a `400` with `message` set to something else — that shape indicates a *domain*-level rejection (`push_error`), not a schema failure.

## "Cannot ... when execution is not IDLE"

Structural mutations (`addElement`, `moveElement`, `copyElement`, `modifyElement`, `deleteElement` on a redline) all reject with a variant of this message if the execution's `status` isn't `IDLE`. This is enforced independently in `api/node_funcs.js` for each operation (see [Data Flows](./Data-Flows.md)) — it means the execution must first transition out of `RUNNING`/`PAUSED`/etc. (typically via `update_execution_status`) before the structural change is allowed. There is no override/force flag for this particular guard exposed over the API.

## 100% coverage failing after a small change

`jest.config.js` enforces 100% statement/branch/function/line coverage, but **only** on the fixed file list in `collectCoverageFrom` (see [Testing](./Testing.md#coverage-enforcement)). If you add a new branch to one of those files (most commonly a `*Service.js`) without a test that exercises it, `npm run test:coverage` — and therefore CI (see [CI/CD](./CI-CD.md)) — will fail on the coverage threshold even if every individual test assertion passes. Conversely, changes to `api/base_funcs.js`/`api/node_funcs.js`/`api/procedure_funcs.js` are **not** coverage-gated at all (they're absent from `collectCoverageFrom`), so a regression there will not be caught by the coverage gate — only by an explicit test assertion failing, if one exists.

## Docker build fails to pull the base image

`Dockerfile`'s `FROM node:22.23.4-slim` requires network access to Docker Hub (or a configured mirror/registry) to pull the base image. Building without that access will fail at the `FROM` step. This is a known characteristic of the current `Dockerfile`, not a bug — see [CI/CD](./CI-CD.md) and [Development](./Development.md#building-the-docker-image-manually).

## Unknown / not documented

The repository contains no `SECURITY.md`, no issue tracker content, and no historical incident notes. Beyond the code-level failure modes above, this wiki does not have grounds to describe additional troubleshooting scenarios (e.g. specific ArangoDB performance tuning, specific production outage patterns) without inventing them, and will not do so.
