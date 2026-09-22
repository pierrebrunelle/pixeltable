import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule, loadGeneratedClient } from './load-generated.mjs';

const { createDocumentBackend } = await loadTypeScriptModule(
  new URL('../examples/authenticated-backend.ts', import.meta.url),
);
const { createServiceClient } = await loadGeneratedClient();

function setup() {
  const requests = [];
  const tickets = new Map();
  let response = () => Response.json({ rows: [] });
  const sessions = new Map([
    ['session-a', { tenantId: 'a' }],
    ['session-b', { tenantId: 'b' }],
    ['session-c', { tenantId: 'c' }],
  ]);
  const handle = createDocumentBackend({
    applicationUrl: 'https://app.test/api/pxt',
    authenticate: async (request) => sessions.get(request.headers.get('cookie')) ?? null,
    services: new Map(
      ['a', 'b'].map((tenant) => [
        tenant,
        {
          baseUrl: `https://${tenant}.service.test`,
          apiKey: `secret-${tenant}`,
          fetch: async (request, options) => {
            options.signal.throwIfAborted();
            requests.push(request);
            return response(request);
          },
        },
      ]),
    ),
    jobs: {
      get: async (tenant, id) => tickets.get(JSON.stringify([tenant, id])),
      put: async (tenant, ticket) => {
        tickets.set(JSON.stringify([tenant, ticket.id]), ticket);
      },
    },
  });
  function client(session) {
    return createServiceClient({
      baseUrl: 'https://app.test/api/pxt',
      headers: { cookie: session, origin: 'https://app.test', authorization: 'Bearer attacker', 'x-tenant-id': 'b' },
      fetch: (input, init) => handle(new Request(input, init)),
    });
  }
  return {
    handle,
    client,
    requests,
    tickets,
    respond: (fn) => {
      response = fn;
    },
  };
}

test('backend rejects missing sessions, unknown tenants, cross-origin writes, and unlisted routes before service access', async () => {
  const { handle, requests } = setup();
  for (const [path, method, headers, expected] of [
    ['/lookup?id=1', 'GET', {}, 401],
    ['/lookup?id=1', 'GET', { cookie: 'invalid' }, 401],
    ['/lookup?id=1', 'GET', { cookie: 'session-c' }, 403],
    ['/docs', 'POST', { cookie: 'session-a', origin: 'https://evil.test' }, 403],
    ['/docs', 'POST', { cookie: 'session-a' }, 403],
    ['/docs', 'GET', { cookie: 'session-a' }, 405],
    ['/admin', 'POST', { cookie: 'session-a', origin: 'https://app.test' }, 404],
    ['/jobs/not-owned', 'GET', { cookie: 'session-a' }, 404],
  ]) {
    const result = await handle(new Request(`https://app.test/api/pxt${path}`, { method, headers }));
    assert.equal(result.status, expected);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  assert.equal(requests.length, 0);
});

test('verified sessions select the service and server credential without forwarding browser headers', async () => {
  const { client, requests } = setup();
  await client('session-a').queries(['session-a']).query_lookup_lookup_get.run({ id: 1 });
  await client('session-b').queries(['session-b']).query_search_search_post.run({ id: 2 });
  assert.equal(requests[0].url, 'https://a.service.test/lookup?id=1');
  assert.equal(requests[1].url, 'https://b.service.test/search');
  assert.deepEqual(await requests[1].json(), { id: 2 });
  for (const [index, tenant] of ['a', 'b'].entries()) {
    assert.equal(requests[index].headers.get('authorization'), `Bearer secret-${tenant}`);
    assert.equal(requests[index].headers.get('cookie'), null);
    assert.equal(requests[index].headers.get('x-tenant-id'), null);
    assert.equal(requests[index].headers.get('origin'), null);
  }
});

test('backend validates inputs and sends multipart files using service credentials', async () => {
  const { handle, client, requests, respond } = setup();
  const headers = { cookie: 'session-a', origin: 'https://app.test', 'content-type': 'application/json' };
  for (const body of ['{', 'null', '{"id":"1","title":"hello"}', '{"id":1}']) {
    assert.equal(
      (await handle(new Request('https://app.test/api/pxt/docs', { method: 'POST', headers, body }))).status,
      400,
    );
  }
  assert.equal(requests.length, 0);
  respond(() => Response.json({ id: 1, title_upper: 'IMAGE' }));
  assert.deepEqual(
    await client('session-a').mutations.insert_upload_upload_post({
      id: 1,
      title: 'image',
      image: new File(['pixels'], 'image.png', { type: 'image/png' }),
    }),
    { id: 1, title_upper: 'IMAGE' },
  );
  const form = await requests[0].formData();
  assert.equal(form.get('image').name, 'image.png');
  assert.equal(await form.get('image').text(), 'pixels');
});

test('background tickets stay tenant-scoped and browser polling never sees the service URL', async () => {
  const { client, requests, respond } = setup();
  respond((request) =>
    new URL(request.url).pathname === '/background'
      ? Response.json({ id: 'job-1', job_url: 'https://a.service.test/_pxt/jobs/job-1' })
      : Response.json({ status: 'done', result: { title_upper: 'DONE' } }),
  );
  const alice = client('session-a');
  const ticket = await alice.mutations.compute_background_background_post({ id: 1, title: 'done' });
  assert.deepEqual(ticket, { id: 'job-1', job_url: '/api/pxt/jobs/job-1' });
  assert.deepEqual(await alice.job(ticket).wait(), { title_upper: 'DONE' });
  assert.equal(requests[1].url, 'https://a.service.test/_pxt/jobs/job-1');
  await assert.rejects(client('session-b').job(ticket).status(), { status: 404 });
  assert.equal(requests.length, 2);
});

test('upstream errors and invalid job URLs cannot leak service details', async () => {
  const { client, respond, tickets } = setup();
  const service = client('session-a');
  respond(() => Response.json({ detail: 'secret-a https://a.service.test/internal' }, { status: 422 }));
  await assert.rejects(service.operations.insert_docs_docs_post({ id: 1, title: 'hello' }), (error) => {
    assert.equal(error.status, 422);
    assert.equal(JSON.stringify(error.body).includes('secret-a'), false);
    return true;
  });
  respond(() => Response.json({ id: 'job-2', job_url: 'https://evil.test/steal' }));
  await assert.rejects(service.operations.compute_background_background_post({ id: 1, title: 'hello' }), {
    status: 502,
  });
  assert.equal(tickets.size, 0);
});
