# Pixeltable TypeScript SDK

Call a running Pixeltable service from Node.js 22 or newer. Generate types from the service's OpenAPI document, then call the routes declared in its Python application file.

This is the first implementation phase, packaged separately within this checkout so it can move to its own repository. It is unpublished and marked private. Python still defines tables, computed columns, indexes, and routes. The SDK supports service requests, multipart uploads, HTTP errors, and background-job polling.

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

## Verify

```bash
npm ci
npm test
npm pack --dry-run
```

The suite checks generation against an OpenAPI snapshot, request and response types, multipart encoding, errors, deadlines, cancellation, and credential boundaries. The snapshot was generated by `tests/service.py` against upstream commit `0d733d47e` using FastAPI 0.141.1.

From this Pixeltable checkout, run the actual service test with a Python environment containing the checkout and its serving dependencies:

```bash
PXT_TEST_PYTHON=/absolute/path/to/python npm run test:integration
```

It starts a service in a temporary Pixeltable home, checks its OpenAPI document against the snapshot, and exercises insert, query, compute, update, delete, image upload, background jobs, and validation errors. It requires local PostgreSQL support through Pixeltable. It does not call an AI provider or a hosted deployment.

See [ROADMAP.md](ROADMAP.md) for the subsequent phases and [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md) for package maintenance.
