# TypeScript SDK maintenance

Run package commands in `typescript-sdk/`. The package has its own dependency lockfile, compiler configuration, tests, and license so it can be extracted into a separate repository.

- `src/index.ts`: named client exports, service-scoped transport, HTTP errors, multipart serialization, job polling.
- `bin/generate.mjs`: local OpenAPI JSON to TypeScript declarations. Binary schemas become `Blob` inputs.
- `tests/service.py`: actual Pixeltable service used for integration and schema generation.
- `tests/fixtures/`: the service's OpenAPI snapshot and generated declarations.
- `tests/types.ts`: successful calls and compile-time rejection cases.
- `tests/*.test.mjs`: transport and generator tests using Node's test runner.
- `tests/integration.mjs`: starts a Python service in a temporary home and tests the client against it.

Change the Python fixture → regenerate its OpenAPI document → run `npm run generate -- tests/fixtures/openapi.json --output tests/fixtures/service.d.ts` → run `npm test` and `npm run test:integration`.

To regenerate OpenAPI from the repository root, set `PIXELTABLE_HOME` to a new temporary directory and `PYTHONPATH` to the checkout, then run your Python executable with `typescript-sdk/tests/service.py --schema typescript-sdk/tests/fixtures/openapi.json`. Do not use your normal Pixeltable home for tests.

The SDK relies on the declared HTTP service surface. Keep Python engine and daemon implementation details outside its public API. Any future typed job result needs additional service metadata or a caller-supplied runtime validator; the current result remains unknown.

Before extraction, move the TypeScript workflow into the new repository, adjust its working directory and fixture checkout paths, choose the repository/package ownership, and remove the private flag only when publishing is intended.
