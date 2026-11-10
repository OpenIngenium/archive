# Error Handling & Logging

## Error shape: `push_error`

`api/base_funcs.js#push_error(message, err)` is the single normalization point used by nearly every `*Service.js` catch block to turn an arbitrary rejection into a consistent JSON error body:

```js
function push_error(message, err) {
  if (typeof err == 'string') err = {'message': err};
  // JSON round-trip the error to strip circular refs / non-serializable fields
  const err_json = JSON.stringify(err);          // if this throws, fall back to {message, details:[util.inspect(err)]}
  const err_new = JSON.parse(err_json);
  err_new.message = message;                      // caller-supplied, human-oriented message replaces whatever was on err
  err_new.details = err_new.details || [];
  if (err.message) err_new.details.push(typeof err.message === 'string' ? err.message : util.inspect(err.message));
  if (err_new.details.length === 0) err_new.details.push(util.inspect(err));
  return err_new;                                   // {message, details: [...], ...any other JSON-serializable fields on err}
}
```

Usage pattern, repeated across essentially every service (`controllers/ExecutionService.js#create_execution` shown as the canonical example):

```js
try {
  const data = await node_funcs.createExecution(executionInput);
  res.status(200).json(data);
} catch(err) {
  const err_data = base_funcs.push_error('Error when creating an execution', err);
  res.status(400).json(err_data);
}
```

**Result**: nearly every failed mutation returns HTTP `400` with `{"message": "<human-readable context>", "details": ["<underlying error info>"]}`. A handful of services return more specific codes when they can distinguish the failure (e.g. `controllers/VenueService.js#get_venue` returns `404` if the rejection string starts with `"No venue was found:"`, otherwise `400`; `set_venue_status`/`update_venue` propagate a caller-supplied `err_obj.error_code`/`err_obj.message` instead of hardcoding 400 — grounded **inference**: this implies at least one call site in `api/node_funcs.js` rejects with a structured `{error_code, message}` object rather than a plain string/Error for those two operations specifically).

## Error propagation from the domain layer

`api/base_funcs.js`, `api/node_funcs.js`, and `api/procedure_funcs.js` uniformly use `async function` + `Promise.reject('<message>: ' + get_sj_error_message(err))` (never throwing synchronously except for a few programmer-error guard clauses like `get_root_specific_variables`'s invalid-`root_type` check). `get_sj_error_message(err)` extracts `err.response.body.errorMessage` from an `arangojs` error when present (falling back to `util.inspect(err)`), so ArangoDB-originated failures surface a human-readable string instead of the full ArangoDB HTTP error object. There is no custom `Error` subclass hierarchy (e.g. no `NotFoundError`/`ValidationError` classes) — errors are plain strings or plain objects, and callers distinguish cases (like the 404-vs-400 example above) by inspecting the string content, not an error type.

## Schema-validation errors (swagger layer)

Requests that fail `swagger-tools`' `swaggerValidator()` (wrong types, missing required fields, values outside a declared enum, etc.) never reach a controller at all. `index.js` registers a dedicated error-handling middleware **after** the swagger middleware chain:

```js
app.use(function(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && err.failedValidation) {
    const error_obj = { message: 'Failed schema validation', details: [JSON.stringify(err)] };
    res.status(400).send(error_obj);
  } else if (err) {
    return next(err);       // falls through to Express's default error handler
  } else {
    return next();
  }
});
```

So there are two distinct sources of `400` responses with a similar-looking `{message, details}` shape: swagger schema-validation failures (`"Failed schema validation"`, details = the raw validation error JSON) and domain-logic failures (`push_error`'s message, details = human-readable strings). Both are recognizable by the `message` field's content, but neither is tagged with a machine-readable error code/type.

## Logging

`api/base_funcs.js` configures a single shared Winston logger (`log`), exported and reused by every other module (`api/node_funcs.js`, `api/procedure_funcs.js`, every `*Service.js`, `index.js`).

- **Custom levels**: `critical: 0, error: 1, warning: 2, info: 3, debug: 4, trace: 5` (note: `warning`, not `warn`; the default Winston level names are overridden entirely).
- **Format**: `winston.format.combine(splat(), simple(), format(json_formatter)())` — `json_formatter` builds `{timestamp, level, message, ...meta}`, merging a plain-object second log argument's properties directly into the top-level JSON (this is how request-logging attaches `user_name`, `event`, `execution_id`, `procedure_id`, `elem_id` — see below).
- **Level source**: `process.env.LOG_LEVEL` (lowercased) at startup, default `debug`; mutable at runtime via `PATCH /logging` (`api/node_funcs.js#updateLogging` → `log.level = logging_info.level.toLowerCase()`), readable via `GET /logging` (`getLogging` → `{level: log.level.toUpperCase()}`). Both operations require the `admin` scope for the update (`GET` uses default scopes) — see [API Reference](./API-Reference.md).
- **Transports**: always `Console`; additionally `File` (path from `LOG_FILE_PATH`, `maxsize: 5MB`, `maxFiles: 2`, `handleExceptions: true`) if that variable is set.

### Per-request logging (the `express-interceptor` in `index.js`)

Registered before the swagger middleware, but its `intercept()` callback runs after a response body is produced for any `POST`/`PUT`/`PATCH`/`DELETE` request that matched a swagger operation (`req.swagger.apiPath` is set). For each such request it builds:

```js
{ user_name, service: 'archive_ing', event: operationId, execution_id?, procedure_id?, elem_id? }
```

- `user_name` is decoded from the `Authorization` header: `node_funcs.parse_username(...)` for `Bearer` tokens, or `req.params.user` for `Basic` auth (no `Basic`-auth verification logic exists elsewhere in the codebase — this branch reads a username without checking a password, since Basic auth is not otherwise implemented here — **unknown/not documented** whether any client actually uses this branch).
- `execution_id`/`procedure_id`/`elem_id` are pulled from swagger query/path params first, falling back to `req.body.execution_id` for `execution_id` specifically.
- The response body is parsed as JSON (falling back to `util.inspect(body)` if parsing fails) and attached as `log_entry.data`, but **only when the response indicates an error** (`res.statusCode < 200 || >= 400`), in which case `log.error(message, log_entry)` is called; otherwise `log.info(message, log_entry)` is called **without** the response body attached. `message` is the operation's `description` field from `api/swagger.yaml`.

This means: successful mutating requests are logged at `info` with metadata but no response payload; failing ones are logged at `error` with the full response payload attached, and `GET` requests are **not** logged by this interceptor at all (the `isInterceptable` check only matches `POST`/`PUT`/`PATCH`/`DELETE`).

## Retries

The only retry logic in the codebase is:
- `api/base_funcs.js#get_db_list` — retries `listUserDatabases()` up to `count` times (10, from `init_db`), sleeping `milisecs` (4000) between attempts, used only during startup DB connectivity.
- `api/node_funcs.js#setStepOutput` — retries `element_collection.update(...)` up to 3 times when persisting a *final* step result (`PASS`/`FAIL`/`ERROR`), logging a `warning` on each failed attempt before the final rejection.

No other function in the repository implements retry/backoff; all other DB write failures propagate immediately as a rejected promise.
