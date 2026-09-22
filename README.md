# Pixeltable TypeScript SDK

Call a running Pixeltable service from Node.js 22 or newer. Generate types from the service's OpenAPI document, then call the routes declared in its Python application file.

The SDK is packaged separately within this checkout so it can move to its own repository. It is unpublished and marked private. Python still defines tables, computed columns, indexes, and routes. The SDK supports service requests, multipart uploads, HTTP errors, background-job polling, and optional React hooks.

## Install locally

```bash
cd typescript-sdk
npm ci
npm run build
npm pack
```

Install the resulting archive in your application:

```bash
npm install /absolute/path/to/pixeltable-sdk-0.1.0-alpha.0.tgz
```

The root import and `@pixeltable/sdk/server` expose the same named exports. This release is ESM and intended for server code. Keep service credentials in server actions, route handlers, or workers.

## Generate types

Start your Python application's service with `pxt service update` after creating its tables with `pxt schema update`. Use the HTTP endpoint reported by the service command:

```bash
curl --fail "$SERVICE_URL/openapi.json" --output openapi.json
npx pxt-generate-ts openapi.json --output src/pxt.d.ts
```

For an authenticated endpoint, add its required authorization header to the download command. The generator reads a local JSON document. Use the service endpoint as `baseUrl`, including any path prefix. Regenerate types after changing Python routes or their input/output columns.

```typescript
import { createClient } from '@pixeltable/sdk/server';
import type { paths } from './pxt.js';

const pxt = createClient<paths>({
  baseUrl: process.env.PXT_SERVICE_URL!,
  // Optional; sent as Authorization: Bearer <key>.
  apiKey: process.env.PIXELTABLE_API_KEY!,
});

const { data } = await pxt.api.POST('/docs', {
  body: { id: 1, title: 'Hello from TypeScript' },
});
console.log(data);
```

`/docs` and its fields are examples. Generated types accept only the routes, HTTP methods, parameters, and bodies your service declares. Response values retain the service's JSON shape. Pixeltable insert, update, and delete routes currently use POST; a query route can use GET or POST.

The SDK uses [openapi-fetch](https://openapi-ts.dev/openapi-fetch/api) for typed request methods and [openapi-typescript](https://openapi-ts.dev/node) for generation. Their types provide compile-time checks; they do not validate every response at runtime. JSON numbers remain JavaScript numbers: values beyond the safe integer range require a string representation in your Python route.

## Generate named calls

Use `--client` with a `.ts` output to generate a client factory as well as types:

```bash
npx pxt-generate-ts openapi.json --client --output src/pxt.ts
```

```typescript
import { createServiceClient } from './pxt.js';
import { defineQuery } from '@pixeltable/sdk';

const service = createServiceClient({ baseUrl: applicationUrl });
const inserted = await service.operations.insert_docs_docs_post({ id: 1, title: 'Hello' });
const lookup = defineQuery([applicationUrl, sessionId, 'lookup'], service.operations.query_lookup_lookup_get);
const rows = await lookup.run({ id: inserted.id });
```

Names come directly from the service's `operationId` fields. Calls accept typed input and an optional `{ signal }`, serialize the request, and return the JSON result. Upload calls supply the multipart serializer automatically. `service.api` and `service.job` remain available. Pass a generated write function to `usePixeltableMutation`; use `defineQuery` to explicitly identify reads.

Named generation currently supports query parameters or a required JSON/flat multipart body, with one JSON 200 response. It rejects missing or duplicate operation IDs, path/header/cookie parameters, optional bodies, and other response formats before replacing the output. For other routes, generate declarations and use `client.api`. Keep operation IDs stable in Python if application code depends on their names. Generation does not infer permissions.

Services built from this branch include version 1 `x-pixeltable` metadata (`kind` and `background`). With that metadata, the client also generates scoped query handles and mutation functions:

```typescript
const queries = service.queries([sessionId]);
const lookup = queries.query_lookup_lookup_get;
// Inside a component:
const rows = usePixeltableQuery(lookup, { id: 1 });
const insert = usePixeltableMutation(service.mutations.insert_docs_docs_post, { invalidate: [lookup] });
```

`queries(scope)` requires a nonempty session or tenant scope and includes the service URL in each cache key. Synchronous query routes become query handles, including POST queries. Insert, update, delete, compute, and background submissions become mutation functions. They do not automatically invalidate reads; specify affected queries in the hook options. Older schemas still generate named calls but omit these groups. Unknown metadata versions fail generation. This metadata describes execution behavior, not authorization or tenant isolation.

## Upload a file

For a route declared with `uploadfile_inputs`, pass a `File` or `Blob` with `multipartBody` as the serializer:

```typescript
import { multipartBody } from '@pixeltable/sdk/server';

await pxt.api.POST('/upload', {
  body: { id: 2, title: 'Image', image: new Blob([imageBytes], { type: 'image/png' }) },
  bodySerializer: multipartBody,
});
```

The generator maps binary upload fields to `Blob`. The serializer accepts flat string, numeric, boolean, and binary fields; it omits null and undefined values. Fetch supplies the multipart boundary. To preserve a filename, pass a `File`. URLs for media inputs remain strings on JSON routes.

For a route returning a file, use `parseAs: 'blob'`, `'arrayBuffer'`, or `'stream'`. Returned media URLs are plain strings. This phase has no separate presigned upload API.

## Wait for a background job

```typescript
const { data: ticket } = await pxt.api.POST('/background', {
  body: { id: 3, title: 'Run the pipeline' },
});
if (!ticket) throw new Error('Expected a job ticket');

const job = pxt.job(ticket);
const status = await job.status();
const result = await job.wait({ timeoutMs: 60_000, pollIntervalMs: 500 });
```

The SDK follows the returned `job_url`, including service and router prefixes. Jobs report `pending`, `done`, or `error`. `result` is `unknown`: the current service's job schema does not describe each route's final result. Validate or narrow it in your application. A null result is a valid completion.

The default request timeout is 30 seconds. A job wait has a separate five-minute deadline and polls every second. Supply an `AbortSignal` to a request, `job.status()`, or `job.wait()`. Aborting stops the client's request or polling; the server may continue running the operation. Jobs are held in the service process and do not survive a restart.

## Handle errors

```typescript
import { PixeltableHttpError, PixeltableJobError } from '@pixeltable/sdk/server';

try {
  await job.wait();
} catch (error) {
  if (error instanceof PixeltableHttpError) {
    console.error(error.status, error.body);
  } else if (error instanceof PixeltableJobError) {
    console.error(error.jobId, error.message);
  } else {
    throw error;
  }
}
```

Non-success HTTP responses throw `PixeltableHttpError`, preserving the response body, headers, and any machine-readable `errorCode`. Validation details remain available in `body`. Network failures and cancellation keep their native fetch errors. Requests are not retried, because replaying writes could duplicate rows or paid computation.

The default transport rejects redirects and URLs outside the configured service's origin and path prefix. Pass `headers` for application-specific authentication or `fetch` for an alternate transport. A custom transport must honor the `signal` and `redirect` fetch options. The SDK does not implement tenant authorization; your service must enforce it. Hosted services must expose the same HTTP contract to work with this client. Hosted control-plane APIs and the Python catalog proxy protocol are outside this release.

## React queries, mutations, and jobs

Install the optional React dependencies in your application:

```bash
npm install react @tanstack/react-query
```

Wrap the component tree in TanStack Query's `QueryClientProvider`. Create one `QueryClient` for the browser session. Use a separate instance for each server-rendered request and clear the browser cache on logout or account changes.

Define a query with a stable key and a typed function:

```typescript
import { createClient, defineQuery } from '@pixeltable/sdk';
import type { paths } from './pxt.js';

// This URL belongs to your authenticated application backend.
const client = createClient<paths>({ baseUrl: applicationUrl });
const lookup = defineQuery([applicationUrl, sessionId, 'lookup'], async (id: number, options) => {
  const { data } = await client.api.GET('/lookup', {
    params: { query: { id } },
    ...options,
  });
  if (!data) throw new Error('Expected query rows');
  return data.rows;
});
```

The application backend must authenticate the user, authorize access to the route and data, then call the Pixeltable service using server-held credentials. The hooks do not create this backend or enforce tenancy. Do not give a browser the credential-bearing service client. The example requires the application backend to expose the same generated route shapes.

```typescript
import { usePixeltableQuery, usePixeltableMutation, usePixeltableJob } from '@pixeltable/sdk/react';

// Inside a React component:
const rows = usePixeltableQuery(lookup, documentId);
const rename = usePixeltableMutation(
  async (input: { id: number; title: string }) => {
    await client.api.POST('/edit', { body: input });
  },
  { invalidate: [lookup] },
);
const job = usePixeltableJob(jobHandleOrNull, {
  scope: [applicationUrl, sessionId],
  invalidate: [lookup],
});
```

`usePixeltableQuery` returns TanStack Query's result, including `data`, `error`, `isPending`, and `refetch`. Inputs join the handle's key in the cache. Keys must be JSON-serializable and identify the endpoint, session or tenant, and query. Define handles outside render or memoize them. A query must return a defined value; use null for an empty result. Forward the supplied signal to the request so changes and unmounting can cancel obsolete reads. Options support `enabled`, `staleTime`, and `refetchInterval`.

`usePixeltableMutation` accepts an async function, including an application Server Action. It never retries writes, even if the provider has a retry default. On success it invalidates all input variants of the specified handles and waits for active queries to refresh. Failed writes do not invalidate reads. Use `mutate` for event handlers or `mutateAsync` when the caller needs the result.

`usePixeltableJob` accepts a job handle or null while waiting for a ticket. Its required `scope` separates services and sessions in the cache. It polls once a second while mounted, stops on `done`, `error`, or a failed polling request, and invalidates selected query handles once per observed completion. Change the interval with `pollIntervalMs`; `enabled: false` pauses polling. Computation failures appear in `data` as `{ status: 'error', error }`; failed HTTP requests appear in the hook's `error`. Call `refetch()` to retry a failed status request. Query and job requests have retries disabled by these hooks.

Reactivity uses polling and cache invalidation. It provides no cross-query snapshot or transaction guarantee. Queries may also refresh according to your TanStack Query provider defaults. The source checkout includes a compiled example in `examples/react.ts`. Generated named calls can be wrapped with `defineQuery`. When the service includes version 1 `x-pixeltable` metadata, generation also provides `service.queries(scope)` and `service.mutations`.

## Authenticated backend example

The source checkout includes [an authenticated document backend](examples/AUTHENTICATED-BACKEND.md) with a Next.js Route Handler adapter. It selects a separate service for each verified tenant, keeps service credentials on the server, allows only the fixture's routes, and rewrites job tickets for authenticated polling. Supply your application's session verification and shared job store. Tests exercise the handler with both mocked services and the real Pixeltable fixture; a full Next.js deployment remains unverified.

## Verify

```bash
npm ci
npm test
npm pack --dry-run
```

The suite checks generation against an OpenAPI snapshot, request and response types, multipart encoding, errors, deadlines, cancellation, and credential boundaries. The snapshot was generated by `tests/service.py` using this branch's serving metadata and FastAPI 0.141.1.

From this Pixeltable checkout, run the actual service test with a Python environment containing the checkout and its serving dependencies:

```bash
PXT_TEST_PYTHON=/absolute/path/to/python npm run test:integration
```

It starts a service in a temporary Pixeltable home, checks its OpenAPI document against the snapshot, and exercises insert, query, compute, update, delete, image upload, background jobs, and validation errors. It requires local PostgreSQL support through Pixeltable. It does not call an AI provider or a hosted deployment.

See [ROADMAP.md](ROADMAP.md) for the subsequent phases and [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md) for package maintenance.
