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

## Experimental catalog access

`@pixeltable/sdk/experimental/catalog` targets Pixeltable's internal protocol-v4 HTTP catalog endpoint, separately from application HTTP routes:

```typescript
import { createCatalogClient } from '@pixeltable/sdk/experimental/catalog';

const catalog = createCatalogClient({ baseUrl: catalogEndpoint, apiKey: serverCredential });
await catalog.createDirectory('documents', { ifExists: 'ignore' });
const entries = await catalog.listDirectory('', { recursive: true });
```

`baseUrl` must identify an existing protected catalog proxy with a `/rpc` endpoint. An application service URL is insufficient. This adapter does not establish the hosted Python client's TLS tunnel or handle `pxt://` connection discovery. Keep it in trusted server code; the catalog endpoint grants broader access than application routes.

Paths use slash-separated identifiers. Entries include directory names, table IDs, and nested children when requested. The adapter supports directory creation/listing and scalar table creation, opening, insertion, collection, and counts. It is tested against protocol version 4 and metadata schema version 56 in this checkout. The sections below describe supported computed columns, queries, live views, and indexes. Media localization and schema diffs remain incomplete. This experimental API can change alongside the Python protocol.

Create a table with an inferred row type:

```typescript
const documents = await catalog.createTable('documents/items', {
  id: { type: 'int', primaryKey: true },
  title: { type: 'string' },
  score: { type: 'float', nullable: true },
  enabled: { type: 'bool' },
  payload: { type: 'json' },
});
await documents.insert([{ id: 1, title: 'Hello', enabled: true, payload: { source: 'TypeScript' } }]);
const rows = await documents.collect({ limit: 10 });
const count = await documents.count();
```

Column names must be lowercase identifiers starting with a letter. Nullable inputs can be omitted and become null. Other inputs are required. Numeric values must be finite; integer-valued numbers must be within JavaScript's safe integer range. JSON inputs must contain only JSON values; reserved `$pxt` keys are escaped. Collection validates response types and retains nullable output types. Row order is unspecified.

Build filtered queries with typed projections:

```typescript
const matches = await documents
  .query()
  .where(documents.columns.score.gte(0.5).and(documents.columns.enabled.eq(true)))
  .select('id', 'title')
  .orderBy('id', 'desc')
  .limit(10)
  .offset(5)
  .collect();
```

Return named expressions without adding stored columns:

```typescript
const totals = await documents
  .query()
  .selectExpressions({
    item: documents.columns.id,
    doubled_score: documents.columns.score.multiply(2),
  })
  .orderBy('id')
  .collect();
```

Result types contain the selected aliases and preserve expression nullability. Aliases follow the SDK's column-name rules. Filters and ordering still refer to source columns; projections do not add reusable table columns. The same method works on views.

Query builders are immutable: filtering or selecting returns a new query. Predicates support comparisons, `isNull()`, `and()`, `or()`, and `not()`, using columns from the same table. Projections narrow the returned row type. Ordering supports scalar columns other than JSON. `count()` counts matching rows and rejects queries with a limit or offset, matching Python. Joins and aggregates are not yet supported.

Use `openTable(path, schema)` to open an existing base table with runtime schema verification. `createTable` fails if the table exists unless `ifExists: 'ignore'` is specified; an ignored existing table must still match the supplied schema. These table methods reject views and specialized types outside the supported scalar schema; use `openView` for supported views. To open existing computed columns, include `computed: true` in their schema definitions; the SDK verifies that they are computed and excludes them from writes. Creation does not replace tables.

Evolve a base table's scalar schema:

```typescript
const withNotes = await documents.addColumn('note', { type: 'string', nullable: true });
const renamed = await withNotes.renameColumn('note', 'description');
const withoutNotes = await renamed.dropColumn('description');
```

Each operation returns a new typed handle and leaves earlier handles stale for writes. Nullable additions fill existing rows with null; Python validates whether other additions are allowed. Renaming preserves values and computed-column write protection. Dropping removes the column and its values, and Python rejects drops blocked by dependencies. These methods do not replace existing columns, change primary keys, or support type alterations. Column addition, renaming, and removal are currently exposed on base-table handles.

Create a filtered view of a table:

```typescript
const enabledDocuments = await documents.createView('documents/enabled', {
  where: documents.columns.enabled.eq(true),
});
const visible = await enabledDocuments.query().select('id', 'title').collect();
```

Views inherit the base table's schema, including computed columns, and reflect inserts, updates, and deletes in the base. Use `openView(path, schema)` to reopen a live view with schema verification. View handles expose queries, history, computed-column creation, B-tree and text embedding indexes, and nested view creation. They do not expose row insertion, updates, or deletion. Creation fails if the destination exists. Add a view-specific computed column with `const enriched = await enabledDocuments.addComputedColumn('adjusted', enabledDocuments.columns.score.add(1))`, then use the returned handle. Computed values propagate through nested views when the base changes. Schema and index mutations validate versions for the complete base chain; reopen a view after base writes before modifying its schema. Iterators and projected views are not yet supported.

Filter by membership with `documents.columns.id.isIn([1, 3, 5])`. Use `.not()` on the returned predicate for exclusion. Membership also accepts a JSON expression from the same table, such as `documents.columns.id.isIn(documents.columns.payload)`, when each JSON cell contains a list. These predicates work in queries, updates, and deletes. Literal arrays are copied and validated against the scalar column type; unlike Python's literal-list normalization, mismatched values are rejected instead of silently omitted. An empty literal list matches no rows. Literal-list membership follows SQL null semantics: use `isNull()` explicitly to match null cells rather than placing null in the list. JSON-expression membership is evaluated by Python and follows its per-row iterable semantics.

Freeze a table or live view at its current state:

```typescript
const snapshot = await documents.createSnapshot('documents/frozen', {
  where: documents.columns.id.gt(0),
});
const rows = await snapshot.query().select('id', 'title').collect();
const reopened = await catalog.openSnapshot('documents/frozen', documents.schema);
```

The filter is optional. Snapshots retain frozen rows, computed values, and schemas when the source changes. Snapshot handles expose queries, scalar function calls, and further snapshot creation; they omit mutation methods. `openSnapshot()` checks the supplied schema against the frozen schema. A snapshot has its own public identity even when Python reads it directly through a frozen base version. Forced removal of a source can also remove dependent snapshots; snapshots are not independent backups. Creation captures the server's current state, without enforcing the source handle's last-observed version. Iterator and projected snapshots remain unsupported.

Add stored computed columns from same-table expressions:

```typescript
const scored = await documents.addComputedColumn('doubled', documents.columns.score.multiply(2));
await scored.insert([{ id: 2, title: 'Next', score: 3, enabled: true, payload: {} }]);
const results = await scored.query().select('id', 'doubled').collect();
```

Pixeltable backfills existing rows and maintains computed values on subsequent inserts and updates. The returned handle includes the new column's inferred type and nullability. Keep using that returned handle: the original handle retains its old schema and version, so writes through it become stale. Computed columns cannot be inserted or updated directly. Names must be new; creation does not replace existing columns. Use `openTable(path, scored.schema)` to reopen the resulting schema. Computed columns must be added after creating the base table; `createTable` rejects schemas marked `computed: true`. Backfills abort on computation errors by default. Use `addComputedColumn(name, expression, { onError: 'ignore' })` to complete the schema change while retaining failed cells. Inspect the returned handle's `errorType` and `errorMessage` expressions before reading failed required values. This policy applies to that backfill only; subsequent insert calls choose their own error policy. Non-stored computed columns are not yet supported.

Reference scalar Python functions already available on the server:

```typescript
import { defineCatalogFunction } from '@pixeltable/sdk/experimental/catalog';

const upper = defineCatalogFunction(
  'pixeltable.functions.string.upper',
  { self: { type: 'string' } },
  { type: 'string' },
);
const uppercase = documents.callFunction(upper, { self: documents.columns.title });
const withUppercase = await documents.addComputedColumn('uppercase', uppercase);
```

Declare the named parameters and scalar return type, including nullability. Arguments may be literals or compatible expressions from the same table or view. All declared arguments are required. Python resolves the import path and validates the actual function binding; missing functions and incompatible signatures produce catalog errors. Custom UDF modules must already be importable by the server. This API references Python functions; it does not deploy code or serialize TypeScript callbacks. Aggregate/window functions, positional-only parameters, and automatic signature discovery are not supported.

Manage B-tree indexes on integer, float, and string columns, including stored computed columns:

```typescript
await scored.addBtreeIndex('doubled', { name: 'doubled_idx' });
await scored.dropIndex('doubled_idx');
```

Index mutations refresh the handle's version. Creation fails on duplicates unless `ifExists: 'ignore'` is specified; removal fails on missing indexes unless `ifNotExists: 'ignore'` is specified. Omitting the index name during creation lets Python generate it. Tables created with automatic default indexes do not allow separate B-tree index management. Boolean and JSON columns are excluded, matching Python.

Create a text embedding index using an importable Python embedding UDF, then rank a query:

```typescript
await documents.addEmbeddingIndex('title', {
  embedding: 'my_app.embeddings.embed_text',
  name: 'title_vectors',
  metric: 'cosine',
});
const similarity = documents.columns.title.similarity('search terms', 'title_vectors');
const matches = await documents
  .query()
  .selectExpressions({ title: documents.columns.title, score: similarity })
  .orderBy(similarity, 'desc')
  .limit(10)
  .collect();
```

The UDF must already be installed on the Python server and accept a string, returning a fixed-length float array. Python validates the signature and computes embeddings, including backfilling existing rows and maintaining them after writes. This call can invoke the UDF's external provider and incur its costs. The SDK sends an import path; it does not upload an implementation or bind additional UDF parameters. Use a Python wrapper when parameters need binding.

`metric` accepts `cosine` (default), `ip`, or `l2`; `precision` accepts `fp16` (default) or `fp32`. Rank cosine and inner-product scores descending, and L2 distances ascending. Similarity supports projections, predicates, and ordering on tables and live views. Only string-column queries are supported here; image, audio, video, and explicit vector queries remain unsupported. Similarity expressions cannot be stored as computed columns. Index creation uses the same version checks and duplicate policy as B-tree indexes; remove by name with `dropIndex()`.

Inspect errors retained in stored computed columns:

```typescript
const failures = await scored
  .query()
  .where(scored.columns.doubled.errorType.ne(null))
  .selectExpressions({
    id: scored.columns.id,
    type: scored.columns.doubled.errorType,
    message: scored.columns.doubled.errorMessage,
  })
  .collect();
```

`errorType` and `errorMessage` are nullable string expressions: successful rows return `null`. They require stored computed column references; ordinary scalar columns and inline calculations are rejected. Use `insert(rows, { onError: 'ignore' })` to retain rows with failed computed values; the default `onError: 'abort'` rejects the insertion when computation fails. Inserts return `{ insertedRows, errors }`: insertedRows counts rows in the target table and errors includes computation failures in dependent views. Invalid input values still fail local validation before transport. Computed-column creation also defaults to abort; pass `{ onError: 'ignore' }` to `addComputedColumn()` to retain failures during backfill. Select the error properties instead of a failed required value, whose stored null would not match its declared TypeScript type.

Update multiple rows by primary key in one request:

```typescript
const status = await documents.batchUpdate([
  { id: 1, title: 'Revised' },
  { id: 2, title: 'Another revision' },
]);
```

Every row must contain all declared primary-key columns; other writable columns are optional. Values are literals, and computed columns cannot be assigned. Missing rows fail the operation by default. Set `ifNotExists: 'ignore'` to skip them or `'insert'` to insert them; rows that may be inserted must include every required input column. `cascade` defaults to `true`; disabling it leaves dependent computed values unchanged. The result reports updated rows, inserted rows, and errors, including cascaded table/view operations, matching Python's status accounting. These counts can exceed the number of input rows. Batch updates use version checks and are never retried automatically.

Evaluate a pipeline without persisting the input rows:

```typescript
const preview = await scored.compute([{ id: 9, title: 'Preview', score: 3, enabled: true, payload: {} }], {
  onError: 'ignore',
});
console.log(preview[0]?.values, preview[0]?.errors);
```

`compute()` requires a nonempty array with the same input shape as `insert()` and returns `{ values, errors }` for each resulting row. Values are conservatively nullable so failed cells are represented honestly; errors map column names to `{ type, message }`. It defaults to aborting on computation errors. A live view evaluates the base pipeline and drops rows excluded by its filter. Computation does not insert rows or create table versions, but UDFs still execute and can incur costs or external side effects. It uses the current server schema and verifies the returned schema. Scalar and JSON outputs are supported; media outputs are not yet decoded by this adapter. Python excludes embedding-index vectors from compute outputs.

Retry a stored computed column after fixing its Python UDF or restoring an external dependency:

```typescript
const status = await scored.recomputeColumns(['doubled'], { errorsOnly: true });
console.log(status.updatedRows, status.errors);
```

Pass one or more distinct computed-column names. `where` limits affected rows, `errorsOnly: true` retries only failed cells in a single column, and `cascade` defaults to `true` to refresh dependent computed columns. Set `cascade: false` only when leaving dependent values unchanged is intentional. The returned counts include cascaded table/view updates and computation errors; individual errors can remain stored without rejecting the whole operation. Calls check table versions, refresh the handle after success, and never retry automatically. Views can recompute their own computed columns; inherited columns must be recomputed through their base table. UDF calls run again and may incur provider costs.

Catalog lifecycle operations use slash-separated paths:

```typescript
await catalog.move('documents/drafts', 'documents/archive');
await catalog.dropTable('documents/archive');
await catalog.dropDirectory('documents');
```

`move()` renames or relocates a table, view, or directory to an existing parent directory and preserves table identity and dependent views. It fails when the source is missing or the destination exists. Set `ifNotExists: 'ignore'` or `ifExists: 'ignore'` to skip those cases; an ignored destination conflict leaves the source intact. Existing handles keep their original `path` property; reopen at the new path when you need a current handle.

`dropTable()` also removes views. By default it refuses to remove a table with dependent views, and `dropDirectory()` refuses nonempty directories. Explicit `force: true` cascades through dependent views or directory contents, including dependencies outside that directory. Drops are permanent. `ifNotExists: 'ignore'` tolerates missing paths; Python also tolerates missing paths when force is enabled. Root paths are rejected locally. These catalog operations address the current object at a path, without table-version checks, and are never retried by the SDK.

Update or delete matching rows:

```typescript
await documents.update(
  { title: 'Revised', score: null },
  {
    where: documents.columns.id.eq(1),
  },
);
await documents.delete({ where: documents.columns.enabled.eq(false) });
```

Updates accept partial literal rows and return `{ updatedRows }`; deletes return `{ deletedRows }`. Omitting `where` affects every row, matching Python. Updates validate values and reject empty patches. Updates also accept same-table column expressions:

```typescript
await documents.update(
  { score: documents.columns.score.add(1).multiply(2) },
  {
    where: documents.columns.enabled.eq(true),
  },
);
```

Numeric columns support `add`, `subtract`, `multiply`, `divide`, `modulo`, `floorDivide`, and `pow` with numeric literals or same-table numeric expressions. Expressions can be chained or compared in filters. Their calculations run on the server. TypeScript checks scalar types and nullability; runtime checks distinguish integers from floats and reject incompatible assignments (for example, true division into an integer column). For example, `documents.columns.id.multiply(documents.columns.score)` is nullable because `score` is nullable. Comparisons also accept compatible same-table expressions, such as `documents.columns.score.gt(documents.columns.id)`.

Handles retain the catalog version for writes. A concurrent write or schema change can cause `CatalogStaleError` before insertion, update, or deletion. Reopen the table, review its schema, and explicitly retry if appropriate. The SDK never automatically replays a write. A network failure after submission can leave its outcome unknown. These operations apply immediately; previewing schema changes remains a subsequent phase.

Inspect table history and revert the most recent change:

```typescript
const versions = await scored.getVersions({ limit: 5 });
const previous = await scored.revert(scored.schema);
```

History is newest first, with version numbers, ISO timestamps, change descriptions, and row counts as reported by Python. `revert(schema)` removes the latest version permanently, matching Python. Pass the expected schema of the previous version; use the returned handle afterward. To undo adding a computed column, pass the schema saved before adding it. The schema is checked against the server response after rollback; an incorrect expected schema can therefore produce an error after the rollback has occurred. Stale handles cannot initiate a rollback, and the SDK never retries it automatically.

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
