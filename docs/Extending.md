# Extending the System

This page describes how to safely add functionality, based on the pattern already used consistently across all 20 existing resources (see [Architecture](./Architecture.md) and [Core Components](./Core-Components.md)).

## Adding a new endpoint to an existing resource

1. **Add the path/operation to `api/swagger.yaml`** under `paths:`, including `operationId`, `tags`, `security:` (pick the narrowest correct scope set — see [Security](./Security.md) and [API Reference](./API-Reference.md) for existing precedent per resource), `parameters`, `responses`, and `x-swagger-router-controller: <ExistingResourceName>`. Add/reuse a `$ref` under `parameters:`/`definitions:` if the new operation needs a new shared parameter or schema.
2. **Add the handler to `controllers/<ExistingResourceName>.js`**, following the existing one-liner pattern:
   ```js
   module.exports.my_new_op = function my_new_op (req, res, next) {
     MyResource.my_new_op(req.swagger.params, res, next);
   };
   ```
3. **Add the business logic to `controllers/<ExistingResourceName>Service.js`**:
   ```js
   exports.my_new_op = async function(args, res, next) {
     let some_param = args['some_param']['value'];
     try {
       const data = await node_funcs.myNewDomainFunction(some_param);
       res.status(200).json(data);
     } catch (err) {
       const err_data = base_funcs.push_error('Error when ...', err);
       res.status(400).json(err_data);
     }
   }
   ```
4. **Add the domain function** to `api/node_funcs.js` (execution/venue/logging concerns) or `api/procedure_funcs.js` (procedure/version concerns), reusing `api/base_funcs.js` graph primitives (`getStructure`, `addElement`, `updateElement`, etc. — see [Core Components](./Core-Components.md)) instead of writing new AQL where an existing primitive already does what you need. Export it via `module.exports.myNewDomainFunction = myNewDomainFunction` at the bottom of the file, following the existing convention.
5. **Add tests**:
   - `controllers.delegation.test.js` will already cover step 2/3's delegation automatically once the new method exists on the controller/service exports — no change needed there unless you're adding a brand-new resource (see below).
   - Add a test case to the matching `tests/unit/controllers/<ExistingResourceName>Service.test.js`, mocking the domain module (`jest.mock('../../../api/node_funcs')` or `procedure_funcs`) and asserting the success (`res.status(200).json(...)`) and failure (`push_error`-shaped body) paths, per the pattern in [Testing](./Testing.md#adding-a-test-for-a-newchanged-service-function).
6. **Run `npm run test:coverage`** — the 100% coverage gate (see [Testing](./Testing.md#coverage-enforcement)) will fail the build if the new branch in the service file isn't exercised by a test.

## Adding a brand-new resource

In addition to the steps above:
- Create `controllers/<NewResource>.js` and `controllers/<NewResource>Service.js`.
- Add both new files to `jest.config.js`'s `collectCoverageFrom` array (see [Testing](./Testing.md#coverage-enforcement)) — otherwise coverage enforcement silently ignores the new files rather than failing on them, which defeats the purpose of the gate.
- Add the `['NewResource', 'NewResourceService']` pair to `controllerPairs` in `tests/unit/controllers/controllers.delegation.test.js` and its corresponding `jest.mock('../../../controllers/NewResourceService')` line, so the generic delegation contract test covers it too.
- If the new resource introduces new ArangoDB collections/graphs, add the collection/graph name constants to `definitions.js` (following the existing `UPPER_SNAKE_CASE` constant → lowercase-camelCase collection-name convention) and extend `api/base_funcs.js#init_db` to create them when the database is first initialized. Remember `init_db` only runs its creation branch **once**, when the `ingenium` database does not yet exist — there is no schema-migration mechanism in this repository (see [Development](./Development.md)), so a schema change that needs to apply to an already-provisioned database must be handled by an out-of-repository migration/ops step.

## Adding a new step type / element type

`elem_type` and `step_type` are closed enums declared in `api/swagger.yaml` (see [Data Model](./Data-Model.md#the-element-hierarchy) and [API Reference](./API-Reference.md#common-query-parameters)). Adding a new value requires:
- Adding it to every enum list that enumerates `step_type`/`elem_type` in `api/swagger.yaml` (there are multiple `$ref`-independent enum blocks for these — a search for the enum values shown in [Data Model](./Data-Model.md) will find them all).
- Adding any step-type-specific business logic. The existing code has a small number of step-type-specific branches embedded directly in generic functions rather than a plugin/dispatch table — e.g. `api/base_funcs.js#prepareElementForCopy` and `api/node_funcs.js#importProcedureSection` both special-case `CUSTOM_SCRIPT`, `MANUAL_EIP`, and `GDS_MANUAL` inline with `if (elem.step_type === '...')` blocks. **There is no step-type plugin mechanism in this repository** — a new step type with special copy/import semantics must be added as another inline branch in those same functions, following the existing style, rather than registered elsewhere.

## Contribution workflow (per `README.md`)

1. Clone the repository and branch off `devel`.
2. `npm install`.
3. Make changes; add/update tests under `tests/unit/`.
4. `npm run test:coverage` must pass (100% coverage on the files in `jest.config.js`'s `collectCoverageFrom`).
5. Open a PR against `devel` or `main`; GitHub Actions CI (`.github/workflows/ci.yml` — see [CI/CD](./CI-CD.md)) must pass.

There is no `CONTRIBUTING.md` in the repository beyond this section of the README; there is no issue/PR template. If you introduce a new environment variable, update the table in [Configuration](./Configuration.md) (and the equivalent table in `README.md`) so the two stay consistent, per this wiki's own maintenance goal (see [Home](./Home.md)).
