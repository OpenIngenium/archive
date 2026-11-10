# Configuration

All configuration is environment-driven and resolved **once**, at module load, by `config.js`. Nothing else in the codebase reads `process.env` directly for these settings — every other module (`api/base_funcs.js`, `api/node_funcs.js`, `api/procedure_funcs.js`, `index.js`) requires `./config.js` and reads the resolved values from there. The two exceptions are `LOG_LEVEL` and `LOG_FILE_PATH`, which `api/base_funcs.js` reads directly from `process.env` when constructing the Winston logger (see [Error Handling & Logging](./Error-Handling-and-Logging.md)).

## Environment variables

| Variable | `config.js` export | Default (if unset) | Consumed by |
|---|---|---|---|
| `ARANGODBURL` | `db_url` | `http://localhost:8529` | `api/base_funcs.js` (`arangojs(config.db_url)`) |
| `ARANGO_ROOT_PASSWORD` | `db_password` | `somepassword` | `api/base_funcs.js` (`db.useBasicAuth`) |
| `ARANGO_USER` | `db_user` | `root` | `api/base_funcs.js` (`db.useBasicAuth`) |
| `PUBLIC_PEM` | `public_pem` | `''` | `index.js` (`jwt.verify(key, public_pem, {algorithms:['RS256']})`) — **an unset/empty value means every bearer-token request will fail JWT verification** |
| `EXECUTION_ID_PREFIX` | `execution_id_prefix` | `clipper-ingenium-` | `api/node_funcs.js#createExecution` |
| `PROCEDURE_ID_PREFIX` | `procedure_id_prefix` | `clipper-procedure-` | `api/procedure_funcs.js#createProcedure` |
| `ARCHIVE_ING_IMAGE` | `version` | `''` | Parsed as `<repo>:<tag>` → `tag.split('_').join('.')`, e.g. `...:r13_1_1` → `r13.1.1`. Stored on each execution/procedure-version document as `version` |
| `LOG_LEVEL` | *(read directly from `process.env` in `api/base_funcs.js`, not re-exported by `config.js`)* | `debug` | Winston logger level; also mutable at runtime via `PATCH /logging` |
| `LOG_FILE_PATH` | *(read directly from `process.env`)* | unset (console-only) | If set, adds a rotating file transport (5 MB, 2 files kept) in addition to the console transport |

`config.js` also hardcodes two values that are **not** environment-configurable:

```js
module.exports.api_version = 'v5';
module.exports.database_name = 'ingenium';
```

## Precedence and loading order

Every variable follows the same pattern in `config.js` — `process.env.X ? process.env.X : <default>` — evaluated exactly once when `config.js` is first `require()`d (Node's module cache means later changes to `process.env` have no effect until the process restarts or the module cache is cleared, which is why `tests/unit/config.test.js` calls `jest.resetModules()` before each test that varies `process.env`).

There is no config file, no `.env` loader (e.g. `dotenv`), and no CLI-flag override — environment variables are the only input. Every variable must be exported into the shell before `npm start` / `node index.js`.

## Required vs. optional in practice

- **`PUBLIC_PEM`** is the only variable that is technically optional (defaults to `''`) but **functionally required** for any authenticated endpoint to work — with it unset, `jwt.verify` will throw for every bearer token, and every operation except `GET /health` will return `401`/`403` (see [Security](./Security.md)).
- **`ARANGODBURL`**/`ARANGO_ROOT_PASSWORD`/`ARANGO_USER` matter only insofar as they must match a reachable, correctly credentialed ArangoDB instance; `api/base_funcs.js#init_db` retries connecting (`get_db_list`, 10 attempts × 4000 ms by default) before giving up, so a slow-starting ArangoDB instance does not need to be manually sequenced before this service.
- Everything else has a workable default for local development.

## Where the version string is used

`config.version` (derived from `ARCHIVE_ING_IMAGE`) is written into every new execution's `version` field (`api/node_funcs.js#createExecution`) and every new procedure version's `api_version` field (`config.api_version`, not `config.version`, per `api/procedure_funcs.js#createProcedureVersion`). The repository does not document a consumer of these fields beyond storage — **strong inference**: they exist so that clients/exports can tell which service build produced a given execution/version record, but no code in this repository reads them back for compatibility checks.
