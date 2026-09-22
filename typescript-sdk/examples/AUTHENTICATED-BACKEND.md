# Authenticated document backend

`authenticated-backend.ts` serves the document routes from `tests/service.py` behind an application's session authentication. It uses standard `Request` and `Response` objects and can run as a Next.js Route Handler. It is application example code, not an SDK export.

Each tenant has a separate Pixeltable service and catalog. Every authenticated member of a tenant can read and change all documents in that tenant's service. This example does not implement row ownership within a tenant. Do not map two tenants to the same catalog unless your Python routes enforce tenant isolation.

## Connect an existing application

1. Copy `authenticated-backend.ts` into a server-only application module.
2. Generate `pxt.d.ts` from your Python service and update the example's `paths` import. The example's routes and fields match `tests/service.py`; adapt the explicit route handlers when changing the Python application.
3. Supply `authenticate(request)` from your session system. It must verify the session and current tenant membership, return `{ tenantId }`, and return null for expired or revoked sessions. Never derive this result from a browser-provided tenant header, query parameter, or JSON field.
4. Supply a server-owned map from tenant IDs to service URLs and credentials. Load credentials from server environment variables or a secret store.
5. Supply a shared `JobStore` keyed by both tenant ID and job ID. Store only tickets received from the service. Apply a retention period appropriate to the application's job timeout. An in-memory map is sufficient for a single-process demo; multiple backend instances need shared storage. Pixeltable jobs themselves still disappear when the service restarts.

For Next.js, create `app/api/pxt/[...path]/route.ts`:

```typescript
import 'server-only';
import { createDocumentBackend } from '@/lib/authenticated-backend';
import { authenticateSession, tenantServices, jobStore } from '@/lib/server-dependencies';

const handle = createDocumentBackend({
  applicationUrl: process.env.APPLICATION_URL! + '/api/pxt',
  authenticate: authenticateSession,
  services: tenantServices,
  jobs: jobStore,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handle;
export const POST = handle;
```

`server-dependencies` is your application's session adapter, tenant configuration, and job store. No login provider or session database is bundled. Next.js supports these named HTTP method exports with standard Request/Response APIs ([Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)).

Configure request-body and upload-size limits in the application server or ingress before exposing the example. The handler parses bodies in memory. It requires the configured application origin on POST requests, rejects unlisted paths/methods, forwards only declared input fields, and creates service headers independently of browser headers. Responses use `Cache-Control: no-store`. Service errors are replaced with generic messages; add server-side logging through your application's logging system when deploying.

The example rewrites background tickets to `/api/pxt/jobs/<id>` and resolves polling through the tenant's stored ticket. It does not proxy arbitrary media URLs or arbitrary service paths. The fixture returns document IDs and titles, and its background result contains only a title. If you expose media outputs or other result types, add authorization and URL handling for those outputs explicitly.

## Browser client

Generate `pxt.ts` with `--client` from the Python service. Do not pass a service credential to this browser client:

```typescript
const service = createServiceClient({ baseUrl: window.location.origin + '/api/pxt' });
const queries = service.queries([sessionCacheId]);
const result = usePixeltableQuery(queries.query_lookup_lookup_get, { id: documentId });
const insert = usePixeltableMutation(service.mutations.insert_upload_upload_post, {
  invalidate: [queries.query_lookup_lookup_get],
});
```

Same-origin fetch sends the application's session cookie. Use a non-secret cache identity that changes when the user or tenant changes. Clear the QueryClient on logout or account switching. Query keys separate cached results; the backend's session check and tenant service selection enforce access.

## Verification

Run `npm test` for session rejection, cross-origin write rejection, tenant credential selection, multipart uploads, tenant-scoped job polling, and error redaction. Run `PXT_TEST_PYTHON=/path/to/python npm run test:integration` to exercise upload, typed query, and background-job polling through this handler against the real Pixeltable fixture.

The integration invokes the standard request handler directly. It does not start Next.js or verify your session provider, deployment limits, or shared job-store implementation.
