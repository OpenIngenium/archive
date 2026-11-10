# Testing

## Framework and layout

- Framework: [Jest](https://jestjs.io/) 29.x (`devDependencies.jest` in `package.json`).
- Config: `jest.config.js` at the repo root (`testEnvironment: 'node'`).
- Test discovery: `testMatch: ['**/tests/unit/**/*.test.js']` — only files under `tests/unit/` matching `*.test.js` are run; there is no separate integration/e2e suite in this repository.

```text
tests/unit/
├── api/
│   ├── base_funcs.test.js     # pure-logic helpers of api/base_funcs.js (push_error, sanitize_*, isRedlineElement, isInRunForScore, getUserName, ...)
│   └── node_funcs.test.js     # logging + JWT-parsing helpers of api/node_funcs.js
├── controllers/
│   ├── controllers.delegation.test.js   # generic contract test: every Controller.method forwards to Service.method unchanged
│   └── <Resource>Service.test.js        # one file per *Service.js (20 files, covering business logic + response shaping)
├── mocks/
│   ├── testHelpers.js   # makeReq/makeRes/makeArgs/makeNext — Express/swagger-shaped test doubles
│   ├── mockDatabase.js  # makeCursor/makeCollection/makeDatabase — arangojs-shaped test doubles
│   └── mockHttpClient.js
├── config.test.js
└── definitions.test.js
```

No test performs real I/O: `mockDatabase.js`'s `makeCollection()`/`makeDatabase()` return `jest.fn()`-based stand-ins for the small slice of the `arangojs` API the codebase actually calls (`byExample`, `document`, `save`, `update`, `replace`, `remove`, `import`, `exists`, `query`, `useDatabase`, `useBasicAuth`, `listDatabases`, `createDatabase`, `collection`). `jsonwebtoken` and the local `api/*` modules are auto-mocked per-file via `jest.mock(...)` where needed (e.g. `tests/unit/api/base_funcs.test.js` mocks only `jsonwebtoken`, letting the rest of `base_funcs.js` run for real since `arangojs` connects lazily and performs no I/O just from being required).

## The delegation contract test

`tests/unit/controllers/controllers.delegation.test.js` is a single parametrized test that auto-mocks every `*Service.js` module and then, for **every exported method on every controller**, asserts:

```js
controller[method](req, res, next);
expect(service[method]).toHaveBeenCalledTimes(1);
expect(callArgs[0]).toBe(req.swagger.params);
expect(callArgs[1]).toBe(res);
expect(callArgs[2]).toBe(next);
// a few handlers (e.g. update_execution_status) also forward req.headers as a 4th arg
if (callArgs.length === 4) { expect(callArgs[3]).toBe(req.headers); }
```

This single test file is what guarantees the "thin controller" architectural rule described in [Architecture](./Architecture.md) actually holds for all 20 resources, without needing 150 individual delegation tests.

## Mocks

| Helper | File | Provides |
|---|---|---|
| `makeReq(params, headers)` | `mocks/testHelpers.js` | An object shaped like Express's `req`, with `req.swagger.params[key] = {value}` for each key in `params` |
| `makeRes()` | `mocks/testHelpers.js` | A chainable `res` double (`status().json()`, `send()`, `end()`, `set()`, `setHeader()`), all `jest.fn()` |
| `makeArgs(params)` | `mocks/testHelpers.js` | The `{key: {value}}` shape services expect directly (bypassing `req`), used when testing a `*Service.js` function in isolation |
| `makeNext()` | `mocks/testHelpers.js` | A `jest.fn()` standing in for Express's `next` |
| `makeCursor(rows)` / `makeCollection(overrides)` / `makeDatabase(overrides)` | `mocks/mockDatabase.js` | arangojs-shaped doubles; `overrides` lets a test replace just the one method it needs a specific return value/rejection from |
| `makeHttpClient(defaultResponse)` | `mocks/mockHttpClient.js` | Generic HTTP client double that records every request it receives |

## Coverage enforcement

`jest.config.js` sets:

```js
coverageThreshold: { global: { branches: 100, functions: 100, statements: 100, lines: 100 } }
```

...but only over the files explicitly listed in `collectCoverageFrom` — a fixed allow-list of ~38 files (`config.js`, `definitions.js`, every `controllers/*.js` and `controllers/*Service.js` file). A comment in `jest.config.js` explains the intent: *"Coverage is enforced only on source that currently has unit tests. Add modules here as they gain unit-test coverage."* Notably, `api/base_funcs.js`, `api/node_funcs.js`, and `api/procedure_funcs.js` themselves are **not** in `collectCoverageFrom` even though `tests/unit/api/*.test.js` exercises parts of the first two — coverage is not currently enforced on the three largest business-logic modules in the repository.

`clearMocks: true` and `restoreMocks: true` ensure every `jest.fn()`/`jest.spyOn()` is reset between tests automatically — tests do not need manual `afterEach(() => jest.clearAllMocks())` boilerplate.

## Running tests

```bash
npm test              # jest — run once
npm run test:watch    # jest --watch
npm run test:coverage # jest --coverage — this is what CI runs (see CI/CD.md) and what enforces the thresholds above
```

A single test file or pattern: `npx jest tests/unit/controllers/ExecutionService.test.js` or `npx jest -t "create_execution"`.

## Adding a test for a new/changed service function

The established pattern (see e.g. `tests/unit/controllers/HealthService.test.js` for the simplest example, or `tests/unit/controllers/ExecutionService.test.js` for one exercising `node_funcs` mocks):

1. `jest.mock('../../../api/node_funcs')` (and/or `base_funcs`/`procedure_funcs`) at the top of the test file so the service under test is isolated from real graph/DB logic.
2. Build `args`/`res`/`next` via `makeArgs`/`makeRes`/`makeNext` from `mocks/testHelpers.js`.
3. Set the mocked domain function's resolved/rejected value with `mockResolvedValue`/`mockRejectedValue`.
4. Call the service function under test and assert on `res.status`/`res.json` call arguments (success path) and on the `push_error`-shaped body (failure path).
5. If adding a **new** `*Service.js` file, add it to `jest.config.js`'s `collectCoverageFrom` array and to the `controllerPairs` list in `controllers.delegation.test.js` if it also gets a new thin `Controller.js` — otherwise the 100% coverage gate will fail CI and the new controller's delegation won't be verified.

See [Extending the System](./Extending.md) for the full "add a new resource" checklist.
