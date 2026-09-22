import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient, multipartBody, PixeltableHttpError } from '../dist/index.js';

import { loadGeneratedClient, loadTypeScriptModule } from './load-generated.mjs';

import { createCatalogClient } from '../dist/catalog.js';

if (!process.env.PXT_TEST_PYTHON)
  throw new Error('Set PXT_TEST_PYTHON to a Python executable with pixeltable[serve] installed');
const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'pxt-sdk-integration-'));
const portProbe = createServer().listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const service = spawn(
  process.env.PXT_TEST_PYTHON,
  ['typescript-sdk/tests/service.py', '--port', String(port), '--catalog'],
  {
    cwd: root,
    env: { ...process.env, PIXELTABLE_HOME: join(temp, 'home'), PYTHONPATH: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const exited = once(service, 'exit');
let logs = '';
service.stdout.on('data', (chunk) => {
  logs += chunk;
});
service.stderr.on('data', (chunk) => {
  logs += chunk;
});
const baseUrl = `http://127.0.0.1:${port}`;
try {
  const deadline = Date.now() + 90_000;
  let schema;
  while (Date.now() < deadline) {
    if (service.exitCode !== null) throw new Error(logs);
    try {
      const response = await fetch(`${baseUrl}/openapi.json`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        schema = await response.json();
        break;
      }
    } catch {
      /* Wait for the service to bind its socket. */
    }
    await delay(200);
  }
  assert.ok(schema, `Service did not start:\n${logs}`);
  const expectedSchema = JSON.parse(await readFile(new URL('./fixtures/openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema, expectedSchema);
  for (const [path, kind] of Object.entries({
    '/docs': 'insert',
    '/edit': 'update',
    '/remove': 'delete',
    '/preview': 'compute',
    '/search': 'query',
    '/background': 'compute',
  })) {
    assert.deepEqual(schema.paths[path].post['x-pixeltable'], { version: 1, kind, background: path === '/background' });
  }
  const { api, job } = createClient({ baseUrl });
  const { createServiceClient } = await loadGeneratedClient();
  const generated = createServiceClient({ baseUrl });
  const named = generated.operations;
  assert.deepEqual(await named.insert_docs_docs_post({ id: 10, title: 'named' }), { id: 10, title_upper: 'NAMED' });
  assert.deepEqual(await named.query_lookup_lookup_get({ id: 10 }), { rows: [{ id: 10, title_upper: 'NAMED' }] });
  assert.deepEqual(await named.update_edit_edit_post({ id: 10, title: 'renamed' }), { id: 10, title_upper: 'RENAMED' });
  assert.deepEqual(await generated.queries(['test-session']).query_search_search_post.run({ id: 10 }), {
    rows: [{ id: 10, title_upper: 'RENAMED' }],
  });
  assert.deepEqual(await named.delete_remove_remove_post({ id: 10 }), { num_rows: 1 });
  assert.deepEqual((await api.POST('/docs', { body: { id: 1, title: 'hello' } })).data, {
    id: 1,
    title_upper: 'HELLO',
  });
  assert.deepEqual((await api.GET('/lookup', { params: { query: { id: 1 } } })).data, {
    rows: [{ id: 1, title_upper: 'HELLO' }],
  });
  assert.deepEqual((await api.POST('/preview', { body: { id: 3, title: 'preview' } })).data, {
    title_upper: 'PREVIEW',
  });
  assert.deepEqual((await api.GET('/lookup', { params: { query: { id: 3 } } })).data, { rows: [] });
  assert.deepEqual((await api.POST('/edit', { body: { id: 1, title: 'updated' } })).data, {
    id: 1,
    title_upper: 'UPDATED',
  });
  const { data: ticket } = await api.POST('/background', { body: { id: 4, title: 'job' } });
  assert.deepEqual(await job(ticket).wait({ timeoutMs: 20_000, pollIntervalMs: 20 }), { title_upper: 'JOB' });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1kAAAAASUVORK5CYII=',
    'base64',
  );
  assert.deepEqual(
    await named.insert_upload_upload_post({
      id: 11,
      title: 'named image',
      image: new Blob([png], { type: 'image/png' }),
    }),
    { id: 11, title_upper: 'NAMED IMAGE' },
  );
  assert.deepEqual(
    (
      await api.POST('/upload', {
        body: { id: 2, title: 'image', image: new Blob([png], { type: 'image/png' }) },
        bodySerializer: multipartBody,
      })
    ).data,
    { id: 2, title_upper: 'IMAGE' },
  );
  await assert.rejects(
    api.POST('/docs', { body: { id: 'invalid' } }),
    (error) => error instanceof PixeltableHttpError && error.status === 422,
  );
  assert.deepEqual((await api.POST('/remove', { body: { id: 1 } })).data, { num_rows: 1 });
  assert.deepEqual((await api.GET('/lookup', { params: { query: { id: 1 } } })).data, { rows: [] });
  const { createDocumentBackend } = await loadTypeScriptModule(
    new URL('../examples/authenticated-backend.ts', import.meta.url),
  );
  const tickets = new Map();
  const backend = createDocumentBackend({
    applicationUrl: 'https://app.test/api/pxt',
    authenticate: async (request) => (request.headers.get('cookie') === 'test-session' ? { tenantId: 'test' } : null),
    services: new Map([['test', { baseUrl }]]),
    jobs: {
      get: async (tenant, id) => tickets.get(JSON.stringify([tenant, id])),
      put: async (tenant, ticket) => {
        tickets.set(JSON.stringify([tenant, ticket.id]), ticket);
      },
    },
  });
  const browser = createServiceClient({
    baseUrl: 'https://app.test/api/pxt',
    headers: { cookie: 'test-session', origin: 'https://app.test' },
    fetch: (input, init) => backend(new Request(input, init)),
  });
  assert.deepEqual(
    await browser.mutations.insert_upload_upload_post({
      id: 20,
      title: 'through backend',
      image: new Blob([png], { type: 'image/png' }),
    }),
    { id: 20, title_upper: 'THROUGH BACKEND' },
  );
  assert.deepEqual(await browser.queries(['test-session']).query_lookup_lookup_get.run({ id: 20 }), {
    rows: [{ id: 20, title_upper: 'THROUGH BACKEND' }],
  });
  const browserTicket = await browser.mutations.compute_background_background_post({ id: 21, title: 'backend job' });
  assert.ok(browserTicket.job_url.startsWith('/api/pxt/jobs/'));
  assert.deepEqual(await browser.job(browserTicket).wait({ timeoutMs: 20_000, pollIntervalMs: 20 }), {
    title_upper: 'BACKEND JOB',
  });
  assert.equal((await backend(new Request('https://app.test/api/pxt/lookup?id=20'))).status, 401);
  const catalog = createCatalogClient({ baseUrl: `${baseUrl}/catalog` });
  const createdDirectory = await catalog.createDirectory('typescript_catalog');
  assert.match(createdDirectory, /^[0-9a-f-]+$/);
  assert.equal(await catalog.createDirectory('typescript_catalog', { ifExists: 'ignore' }), createdDirectory);
  await assert.rejects(catalog.createDirectory('typescript_catalog'), { name: 'CatalogError' });
  const entries = await catalog.listDirectory();
  assert.ok(entries.some((entry) => entry.name === 'typescript_catalog' && entry.isDirectory));
  const tables = await catalog.listDirectory('sdk_test');
  assert.ok(tables.some((entry) => entry.name === 'docs' && entry.tableId !== null));
  const schemaDefinition = {
    id: { type: 'int', primaryKey: true },
    title: { type: 'string' },
    score: { type: 'float', nullable: true },
    active: { type: 'bool' },
    payload: { type: 'json' },
  };
  const authored = await catalog.createTable('typescript_catalog/docs', schemaDefinition);
  const stale = await catalog.openTable('typescript_catalog/docs', schemaDefinition);
  const authoredRow = {
    id: 1,
    title: 'from TypeScript',
    active: true,
    payload: { $pxt: 'literal user data', nested: [1, null, false] },
  };
  assert.deepEqual(await authored.insert([authoredRow]), { insertedRows: 1 });
  assert.equal(await authored.count(), 1);
  assert.deepEqual(await authored.collect(), [{ ...authoredRow, score: null }]);
  assert.deepEqual(await authored.collect({ limit: 0 }), []);
  await assert.rejects(stale.insert([{ ...authoredRow, id: 2 }]), { name: 'CatalogStaleError' });
  assert.equal(await authored.count(), 1);
  const reopened = await catalog.openTable('typescript_catalog/docs', schemaDefinition);
  assert.deepEqual(await reopened.insert([{ ...authoredRow, id: 2, score: 2.5 }]), { insertedRows: 1 });
  assert.equal(await reopened.count(), 2);
  await assert.rejects(
    catalog.openTable('typescript_catalog/docs', { ...schemaDefinition, title: { type: 'int' } }),
    /Schema mismatch/,
  );
  assert.equal(
    (await catalog.createTable('typescript_catalog/docs', schemaDefinition, { ifExists: 'ignore' })).id,
    authored.id,
  );
  await reopened.insert([
    { ...authoredRow, id: 3, title: 'third', score: 3.5 },
    { ...authoredRow, id: 4, title: 'fourth', active: false },
  ]);
  const query = reopened.query().where(reopened.columns.id.gt(1).and(reopened.columns.active.eq(true)));
  assert.deepEqual(await query.select('id', 'title').orderBy('id', 'desc').limit(1).collect(), [
    { id: 3, title: 'third' },
  ]);
  assert.deepEqual(await query.select('id').orderBy('id').offset(1).collect(), [{ id: 3 }]);
  assert.equal(await query.count(), 2);
  await assert.rejects(query.limit(1).count(), /count\(\) cannot be used/);
  assert.deepEqual(await reopened.query().where(reopened.columns.score.isNull()).select('id').orderBy('id').collect(), [
    { id: 1 },
    { id: 4 },
  ]);
  assert.equal(await reopened.query().where(reopened.columns.score.eq(null).not()).count(), 2);
  assert.equal(
    await reopened
      .query()
      .where(reopened.columns.id.lt(2).or(reopened.columns.title.eq('fourth')))
      .count(),
    2,
  );
  assert.equal(await reopened.query().where(reopened.columns.id.gte(2.5)).count(), 2);
  assert.equal(await reopened.query().where(reopened.columns.payload.eq(authoredRow.payload)).count(), 4);
  console.log(
    'Pixeltable integration passed: OpenAPI, insert, query, compute, update, delete, upload, jobs, validation, authenticated backend, catalog operations.',
  );
} finally {
  if (service.exitCode === null) service.kill('SIGTERM');
  await exited;
  await rm(temp, { recursive: true, force: true });
}
