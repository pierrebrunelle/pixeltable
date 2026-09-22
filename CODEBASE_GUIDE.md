# TypeScript SDK maintenance

Run package commands in `typescript-sdk/`. The package has its own dependency lockfile, compiler configuration, tests, and license so it can be extracted into a separate repository.

- `src/index.ts`: named client exports, service-scoped transport, HTTP errors, multipart serialization, job polling.
- `src/catalog.ts`: experimental direct-HTTP catalog operations using the existing proxy dispatcher.
- `src/proxy-protocol.ts`: protocol version constants and binary framing; tagged JSON stays opaque.
- `src/handles.ts`: framework-independent typed query handles and cache identities.
- `src/react.ts`: optional TanStack Query hooks for reads, writes, and job status.
- `bin/generate.mjs`: local OpenAPI JSON to TypeScript declarations. Binary schemas become `Blob` inputs.
- `bin/client-source.mjs`: optional named calls for supported service routes, enabled by `--client`.
- `examples/authenticated-backend.ts`: explicit document routes behind an application session and tenant-to-service map.
- `tests/backend.test.mjs`: authentication, tenant selection, credential boundaries, and job-ticket tests.
- `tests/service.py`: actual Pixeltable service used for integration and schema generation.
- `tests/fixtures/`: the service's OpenAPI snapshot, generated declarations, and generated client.
- `tests/types.ts`: successful calls and compile-time rejection cases.
- `tests/*.test.mjs`: transport and generator tests using Node's test runner.
- `tests/react.test.mjs`: mounted React hook tests for cancellation, caching, invalidation, and job transitions.
- `tests/integration.mjs`: starts a Python service in a temporary home and tests the client against it.

Change the Python fixture → regenerate its OpenAPI document → run `npm run generate -- tests/fixtures/openapi.json --output tests/fixtures/service.d.ts` → run `npm run generate -- tests/fixtures/openapi.json --client --output tests/fixtures/client.ts` → run `npm test` and `npm run test:integration`.

To regenerate OpenAPI from the repository root, set `PIXELTABLE_HOME` to a new temporary directory and `PYTHONPATH` to the checkout, then run your Python executable with `typescript-sdk/tests/service.py --schema typescript-sdk/tests/fixtures/openapi.json`. Do not use your normal Pixeltable home for tests.

The SDK relies on the declared HTTP service surface. Keep Python engine and daemon implementation details outside its public API. Any future typed job result needs additional service metadata or a caller-supplied runtime validator; the current result remains unknown.

Before extraction, move the TypeScript workflow into the new repository, adjust its working directory and fixture checkout paths, choose the repository/package ownership, and remove the private flag only when publishing is intended.

The root and server imports must remain usable without React installed. React and TanStack Query are optional peer dependencies used only by the `./react` entry point. Keep cache keys scoped by application endpoint and session; clear the application cache when its authentication context changes.

Generated client fixtures are typechecked with the package. Runtime tests transpile the same fixture into a temporary module and remove it after loading. Keep declaration-only generation available for OpenAPI shapes outside named-call support.

`FastAPIRouter.add_api_route` adds version 1 `x-pixeltable` metadata only for `PxtEndpoint` operations. Keep `kind` and `background` synchronized with the registered route. The generator uses this extension for query handles and mutation functions; plain OpenAPI operations retain only named calls. New metadata versions require an explicit generator update.

Regenerate the catalog framing fixture with `PYTHONPATH=.. /path/to/python tests/proxy-fixture.py` from `typescript-sdk/`. Match the Python protocol and metadata versions before extending the experimental catalog adapter. The live test mounts the existing proxy daemon app only inside its temporary loopback fixture with `--catalog`; production application services are unchanged.
