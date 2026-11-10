# Ingenium Archive

Graph-backed REST API service for storing and executing Ingenium test procedures, built on Node.js, Express, and ArangoDB.

[![CI](https://github.com/OpenIngenium/archive/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenIngenium/archive/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-339933?logo=node.js&logoColor=white)](.nvmrc)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](#license)

## Overview

Ingenium Archive is the persistence and API layer for the Ingenium test-procedure execution ecosystem. It exposes a versioned REST API (`/api/v5`, defined in [`api/swagger.yaml`](api/swagger.yaml)) backed by ArangoDB, modeling procedures and their runtime executions — steps, sections, paragraphs, comments, and files — as graphs rather than flat records (see [`definitions.js`](definitions.js) for the underlying collections and graphs: `execution_graph`, `history_graph`, `procedure_graph`).

It is the storage companion to Ingenium Core: other Ingenium services and clients use it to author procedures, run executions of those procedures against test venues (venue types `WSTS`, `Testbed`, `ATLO`, and `Other`, per `api/swagger.yaml`), and retain a full history of what happened during each run.

> Looking for implementation-level detail (architecture, data model, request/data flows, security model, etc.) rather than a quick start? See the [DeepWiki](docs/Home.md).

## Features

- **Graph data model** — procedures, procedure versions, and executions are stored as ordered/versioned graphs in ArangoDB rather than flat tables.
- **Versioned OpenAPI (Swagger 2.0) contract** — the full API surface (executions, procedures, procedure versions, venues, venue groups, sections, procedure sections, steps, paragraphs, files, comments, logging) is defined in [`api/swagger.yaml`](api/swagger.yaml) and served with `swagger-tools`.
- **Interactive API docs** — Swagger UI at `/docs`.
- **JWT-based authorization** — RS256-signed bearer tokens with scope checks (`admin`, `execute:wsts`, `execute:testbed`, `execute:sit`, `execute:other`, `config_mgmt`, `imcm`, `test_lead`, `author`, `basic`).
- **Structured logging** — JSON logs via Winston with a configurable level, optional file output, and a runtime logging-status endpoint.
- **Health check** — unauthenticated `/health` endpoint for liveness/readiness probes.
- **Container-first deployment** — `Dockerfile` builds a production image for the service.

## Installation

### Prerequisites
- Node.js matching [`.nvmrc`](.nvmrc) (`22.23.4`); `package.json` requires `>=22.0.0 <23`.
- An accessible ArangoDB instance.

### Install dependencies
```bash
npm install
```

## Quick Start

1. Start the service against an existing ArangoDB instance:
   ```bash
   npm start
   ```
2. Check that it's up — `/health` requires no authentication:
   ```bash
   curl http://localhost:8010/api/v5/health
   ```
   ```json
   {"status": "OK", "message": ""}
   ```
3. Explore the API interactively:
   - Swagger UI: `http://localhost:8010/docs`

## Usage

All endpoints are versioned under `/api/v5` ([`config.js`](config.js), [`api/swagger.yaml`](api/swagger.yaml)). Every operation except `/health` requires an `Authorization: Bearer <jwt>` header; the token is verified with RS256 against the key configured via `PUBLIC_PEM`, and its `scopes` claim is matched against the scopes each operation requires (`securityDefinitions.UserSecurity` in `api/swagger.yaml`, enforced in [`index.js`](index.js)).

Example — create an execution (requires `execute:wsts`, `execute:testbed`, `execute:sit`, or `execute:other`; `venue_id` is the only required field, per `ExecutionInfoInput` in `api/swagger.yaml`):
```bash
curl -X POST http://localhost:8010/api/v5/executions \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"venue_id": "your-venue-id"}'
```

The complete set of resources — executions, procedures, procedure versions, venues, venue groups, sections, procedure sections, steps, paragraphs, files, and comments — is documented in `api/swagger.yaml` and browsable live via `/docs`.

## Configuration

All configuration is environment-driven and resolved in [`config.js`](config.js):

| Variable | Purpose | Default |
|---|---|---|
| `ARANGODBURL` | ArangoDB connection URL | `http://localhost:8529` |
| `ARANGO_ROOT_PASSWORD` | ArangoDB password | `somepassword` |
| `ARANGO_USER` | ArangoDB user | `root` |
| `PUBLIC_PEM` | RS256 public key (PEM) used to verify JWTs | `''` (unset — authenticated requests will fail) |
| `EXECUTION_ID_PREFIX` | Prefix used when generating execution IDs | `clipper-ingenium-` |
| `PROCEDURE_ID_PREFIX` | Prefix used when generating procedure IDs | `clipper-procedure-` |
| `ARCHIVE_ING_IMAGE` | Image tag used to derive the reported service version (e.g. `...:r13_1_1` → `r13.1.1`) | `''` |
| `LOG_LEVEL` | Winston log level (`critical`, `error`, `warning`, `info`, `debug`, `trace`) | `debug` |
| `LOG_FILE_PATH` | If set, also writes logs to this file (rotated at 5 MB, 2 files kept) | unset (console only) |

## Project Structure

```text
.
├── api/                 # Swagger/OpenAPI spec + shared DB/log/business-logic helpers
│   ├── swagger.yaml
│   ├── base_funcs.js
│   ├── node_funcs.js
│   └── procedure_funcs.js
├── controllers/         # Thin swagger-tools route handlers + *Service business logic
├── tests/unit/          # Jest unit tests (controllers, api, mocks)
├── .github/workflows/   # CI pipeline
├── config.js            # Environment-driven configuration
├── definitions.js       # ArangoDB collection/graph names and enums
├── index.js             # Express + swagger-tools bootstrap
└── Dockerfile           # Production image
```

## Development

```bash
npm install          # install dependencies
npm start            # run the API locally (requires a reachable ArangoDB)
npm test             # run the Jest unit test suite
npm run test:watch   # run tests in watch mode
npm run test:coverage
```
`package.json` does not currently define separate lint, format, or type-check scripts.

## Testing & CI

- Unit tests use [Jest](https://jestjs.io/) and live under `tests/unit/` (`controllers/`, `api/`, and shared `mocks/`).
- [`jest.config.js`](jest.config.js) enforces 100% statement/branch/function/line coverage for the files listed in `collectCoverageFrom` (`config.js`, `definitions.js`, and every `controllers/*.js`).
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes and pull requests targeting `devel` and `main`:
  - **Test** — installs dependencies with `npm ci` and runs `npm run test:coverage` using the Node.js version pinned in `.nvmrc`.
  - **Docker** — after tests pass, builds the production image with `docker build`.

## Documentation

- Interactive API reference: Swagger UI (`/docs`), served by the running application.
- Full API contract: [`api/swagger.yaml`](api/swagger.yaml).
- **DeepWiki** — a deeper, developer-oriented technical reference covering architecture, the graph data model, request/data flows, configuration, testing, and CI/CD: see [`docs/Home.md`](docs/Home.md).

## Contributing

1. Clone the repository and branch off `devel`.
2. Install dependencies with `npm install`.
3. Make your changes and add or update tests under `tests/unit/`.
4. Run `npm run test:coverage` and confirm it passes — 100% coverage is enforced for tracked files.
5. Open a pull request against `devel` or `main`; CI (`.github/workflows/ci.yml`) must pass.

No `CONTRIBUTING.md` currently exists in this repository.

## Security

No `SECURITY.md` or documented vulnerability-reporting process currently exists in this repository. For security concerns, contact the Ingenium development team below.

## License

This project is licensed under the Apache License 2.0. See [`LICENSE`](LICENSE).

## Contact

Ingenium Development Team
