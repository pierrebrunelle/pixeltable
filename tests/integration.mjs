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

import { createCatalogClient, CatalogError, defineCatalogFunction } from '../dist/catalog.js';

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
  assert.equal(await reopened.query().where(reopened.columns.score.gt(reopened.columns.id)).count(), 2);
  assert.deepEqual(await reopened.update({ score: reopened.columns.id.multiply(reopened.columns.score) }), {
    updatedRows: 4,
  });
  assert.deepEqual(await reopened.query().select('id', 'score').orderBy('id').collect(), [
    { id: 1, score: null },
    { id: 2, score: 5 },
    { id: 3, score: 10.5 },
    { id: 4, score: null },
  ]);
  assert.deepEqual(
    await reopened.update(
      { score: reopened.columns.id.add(2).multiply(3).divide(2) },
      { where: reopened.columns.id.eq(3) },
    ),
    { updatedRows: 1 },
  );
  assert.deepEqual(await reopened.query().where(reopened.columns.id.eq(3)).select('score').collect(), [{ score: 7.5 }]);
  assert.equal(await reopened.query().where(reopened.columns.id.add(1).gt(4)).count(), 1);
  await assert.rejects(reopened.update({ id: reopened.columns.score }), /expression type/);
  await assert.rejects(reopened.update({ id: reopened.columns.id.divide(2) }), /expression type/);
  assert.deepEqual(
    await reopened.update(
      { title: 'updated', score: null },
      {
        where: reopened.columns.id.eq(3),
      },
    ),
    { updatedRows: 1 },
  );
  assert.deepEqual(await reopened.query().where(reopened.columns.id.eq(3)).select('title', 'score').collect(), [
    { title: 'updated', score: null },
  ]);
  await assert.rejects(authored.update({ title: 'stale' }), { name: 'CatalogStaleError' });
  await assert.rejects(authored.delete(), { name: 'CatalogStaleError' });
  assert.equal(await reopened.count(), 4);
  assert.deepEqual(await reopened.delete({ where: reopened.columns.id.eq(4) }), { deletedRows: 1 });
  assert.deepEqual(await reopened.delete({ where: reopened.columns.id.eq(999) }), { deletedRows: 0 });
  assert.deepEqual(await reopened.update({ active: false }), { updatedRows: 3 });
  assert.equal(await reopened.query().where(reopened.columns.active.eq(true)).count(), 0);
  assert.deepEqual(await reopened.delete(), { deletedRows: 3 });
  assert.equal(await reopened.count(), 0);
  const source = await catalog.createTable('typescript_catalog/computed', {
    id: { type: 'int', primaryKey: true },
    score: { type: 'float', nullable: true },
  });
  await source.insert([{ id: 1, score: 2 }, { id: 2 }]);
  const computed = await source.addComputedColumn('doubled', source.columns.score.multiply(2));
  assert.deepEqual(await computed.query().orderBy('id').collect(), [
    { id: 1, score: 2, doubled: 4 },
    { id: 2, score: null, doubled: null },
  ]);
  await assert.rejects(source.insert([{ id: 3, score: 5 }]), { name: 'CatalogStaleError' });
  await computed.insert([{ id: 3, score: 5 }]);
  await computed.update({ score: 4 }, { where: computed.columns.id.eq(1) });
  assert.deepEqual(await computed.query().orderBy('id').select('id', 'doubled').collect(), [
    { id: 1, doubled: 8 },
    { id: 2, doubled: null },
    { id: 3, doubled: 10 },
  ]);
  await assert.rejects(computed.update({ doubled: 100 }), /computed update column/);
  await assert.rejects(computed.insert([{ id: 4, score: 1, doubled: 2 }]), /insert column/);
  const restored = await catalog.openTable('typescript_catalog/computed', computed.schema);
  assert.equal(await restored.query().where(restored.columns.doubled.gt(5)).count(), 2);
  const chained = await restored.addComputedColumn('tripled', restored.columns.doubled.multiply(1.5));
  assert.deepEqual(await chained.query().where(chained.columns.id.eq(1)).select('tripled').collect(), [
    { tripled: 12 },
  ]);
  await assert.rejects(chained.addComputedColumn('tripled', chained.columns.score), /already exists/);
  await assert.rejects(chained.addComputedColumn('invalid-name', chained.columns.score), /Column names/);
  await chained.addBtreeIndex('tripled', { name: 'tripled_idx' });
  await assert.rejects(chained.addBtreeIndex('tripled', { name: 'tripled_idx' }), CatalogError);
  await chained.addBtreeIndex('tripled', { name: 'tripled_idx', ifExists: 'ignore' });
  await assert.rejects(restored.addBtreeIndex('score', { name: 'stale_idx' }), { name: 'CatalogStaleError' });
  await chained.insert([{ id: 4, score: 6 }]);
  assert.equal(await chained.query().where(chained.columns.tripled.gte(18)).count(), 1);
  await chained.dropIndex('tripled_idx');
  await assert.rejects(chained.dropIndex('tripled_idx'), CatalogError);
  await chained.dropIndex('tripled_idx', { ifNotExists: 'ignore' });
  await chained.update({ score: 7 }, { where: chained.columns.id.eq(4) });
  assert.equal(await chained.query().where(chained.columns.tripled.eq(21)).count(), 1);
  const history = await chained.getVersions({ limit: 2 });
  assert.equal(history.length, 2);
  assert.equal(history[0].updates, 1);
  assert.equal(history[0].changeType, 'data');
  assert.ok(Number.isFinite(Date.parse(history[0].createdAt)));
  await assert.rejects(restored.revert(restored.schema), { name: 'CatalogStaleError' });
  const reverted = await chained.revert(chained.schema);
  assert.equal((await reverted.getVersions({ limit: 1 }))[0].version, history[1].version);
  assert.equal(await reverted.query().where(reverted.columns.tripled.eq(18)).count(), 1);
  assert.equal(await reverted.query().where(reverted.columns.tripled.eq(21)).count(), 0);
  const withExtra = await reverted.addComputedColumn('extra', reverted.columns.id.add(1));
  const withoutExtra = await withExtra.revert(reverted.schema);
  assert.deepEqual(Object.keys(withoutExtra.schema), Object.keys(reverted.schema));
  await withoutExtra.insert([{ id: 5, score: 1 }]);
  assert.equal(await withoutExtra.query().where(withoutExtra.columns.id.eq(5)).count(), 1);
  const view = await withoutExtra.createView('typescript_catalog/filtered', {
    where: withoutExtra.columns.score.gte(4),
  });
  assert.deepEqual(await view.query().select('id').orderBy('id').collect(), [{ id: 1 }, { id: 3 }, { id: 4 }]);
  assert.equal(typeof view.insert, 'undefined');
  const openedView = await catalog.openView('typescript_catalog/filtered', withoutExtra.schema);
  assert.equal(await openedView.count(), 3);
  await withoutExtra.insert([{ id: 6, score: 8 }]);
  assert.equal(await view.count(), 4);
  await withoutExtra.update({ score: 0 }, { where: withoutExtra.columns.id.eq(3) });
  assert.equal(await view.count(), 3);
  await withoutExtra.delete({ where: withoutExtra.columns.id.eq(6) });
  assert.equal(await view.count(), 2);
  assert.deepEqual(await view.query().select('id', 'tripled').orderBy('id').collect(), [
    { id: 1, tripled: 12 },
    { id: 4, tripled: 18 },
  ]);
  await assert.rejects(catalog.openTable('typescript_catalog/filtered', withoutExtra.schema), TypeError);
  await assert.rejects(catalog.openView('typescript_catalog/computed', withoutExtra.schema), TypeError);
  await assert.rejects(withoutExtra.createView('typescript_catalog/filtered'), CatalogError);
  await assert.rejects(openedView.addBtreeIndex('score', { name: 'old_view_idx' }), { name: 'CatalogStaleError' });
  const currentView = await catalog.openView('typescript_catalog/filtered', withoutExtra.schema);
  const enrichedView = await currentView.addComputedColumn('adjusted', currentView.columns.tripled.add(2));
  assert.deepEqual(await enrichedView.query().select('id', 'adjusted').orderBy('id').collect(), [
    { id: 1, adjusted: 14 },
    { id: 4, adjusted: 20 },
  ]);
  assert.equal(typeof enrichedView.insert, 'undefined');
  await enrichedView.addBtreeIndex('adjusted', { name: 'adjusted_idx' });
  await enrichedView.dropIndex('adjusted_idx');
  const nestedView = await enrichedView.createView('typescript_catalog/nested', {
    where: enrichedView.columns.adjusted.gte(15),
  });
  assert.deepEqual(await nestedView.query().select('id', 'adjusted').collect(), [{ id: 4, adjusted: 20 }]);
  await withoutExtra.update({ score: 9 }, { where: withoutExtra.columns.id.eq(1) });
  assert.deepEqual(await nestedView.query().select('id', 'adjusted').orderBy('id').collect(), [
    { id: 1, adjusted: 29 },
    { id: 4, adjusted: 20 },
  ]);
  await assert.rejects(enrichedView.addComputedColumn('stale_column', enrichedView.columns.id.add(1)), {
    name: 'CatalogStaleError',
  });
  assert.ok((await enrichedView.getVersions({ limit: 1 }))[0].version > 0);
  const evolving = await catalog.createTable('typescript_catalog/evolving', { id: { type: 'int' } });
  await evolving.insert([{ id: 1 }]);
  const added = await evolving.addColumn('note', { type: 'string', nullable: true });
  assert.deepEqual(await added.collect(), [{ id: 1, note: null }]);
  await added.update({ note: 'hello' });
  await assert.rejects(evolving.addColumn('old', { type: 'int', nullable: true }), { name: 'CatalogStaleError' });
  const renamed = await added.renameColumn('note', 'text');
  assert.deepEqual(await renamed.collect(), [{ id: 1, text: 'hello' }]);
  await renamed.insert([{ id: 2, text: 'next' }]);
  const dropped = await renamed.dropColumn('text');
  assert.deepEqual(await dropped.query().orderBy('id').collect(), [{ id: 1 }, { id: 2 }]);
  const derived = await dropped.addComputedColumn('double_id', dropped.columns.id.multiply(2));
  await assert.rejects(derived.dropColumn('id'), CatalogError);
  assert.equal(await derived.count(), 2);
  await assert.rejects(derived.addColumn('double_id', { type: 'int' }), /already exists/);
  await assert.rejects(derived.renameColumn('id', 'invalid-name'), /Column names/);
  const renamedComputed = await derived.renameColumn('double_id', 'twice');
  assert.deepEqual(await renamedComputed.query().select('twice').orderBy('id').collect(), [{ twice: 2 }, { twice: 4 }]);
  await renamedComputed.dropColumn('twice');
  const projected = await withoutExtra
    .query()
    .selectExpressions({
      item: withoutExtra.columns.id,
      doubled_score: withoutExtra.columns.score.multiply(2),
    })
    .where(withoutExtra.columns.id.lte(2))
    .orderBy('id')
    .collect();
  assert.deepEqual(projected, [
    { item: 1, doubled_score: 18 },
    { item: 2, doubled_score: null },
  ]);
  assert.deepEqual(
    await nestedView
      .query()
      .selectExpressions({
        label: nestedView.columns.id,
        total: nestedView.columns.adjusted.add(1),
      })
      .where(nestedView.columns.id.eq(1))
      .collect(),
    [{ label: 1, total: 30 }],
  );
  const functionsTable = await catalog.createTable('typescript_catalog/functions', { text: { type: 'string' } });
  await functionsTable.insert([{ text: 'hello' }]);
  const decorate = defineCatalogFunction(
    'udf_fixture.decorate',
    {
      text: { type: 'string' },
      prefix: { type: 'string' },
    },
    { type: 'string' },
  );
  const upper = defineCatalogFunction(
    'pixeltable.functions.string.upper',
    {
      self: { type: 'string' },
    },
    { type: 'string' },
  );
  const decorated = functionsTable.callFunction(decorate, { text: functionsTable.columns.text, prefix: 'Hi ' });
  assert.deepEqual(await functionsTable.query().selectExpressions({ result: decorated }).collect(), [
    { result: 'Hi hello' },
  ]);
  const withFunction = await functionsTable.addComputedColumn(
    'upper_text',
    functionsTable.callFunction(upper, { self: decorated }),
  );
  assert.deepEqual(await withFunction.collect(), [{ text: 'hello', upper_text: 'HI HELLO' }]);
  await withFunction.insert([{ text: 'world' }]);
  assert.deepEqual(await withFunction.query().select('upper_text').orderBy('text').collect(), [
    { upper_text: 'HI HELLO' },
    { upper_text: 'HI WORLD' },
  ]);
  const missing = defineCatalogFunction('udf_fixture.missing', { text: { type: 'string' } }, { type: 'string' });
  await assert.rejects(
    withFunction
      .query()
      .selectExpressions({
        bad: withFunction.callFunction(missing, { text: withFunction.columns.text }),
      })
      .collect(),
    CatalogError,
  );
  const incompatible = defineCatalogFunction(
    'udf_fixture.decorate',
    {
      text: { type: 'string' },
      prefix: { type: 'string' },
    },
    { type: 'int' },
  );
  await assert.rejects(
    withFunction
      .query()
      .selectExpressions({
        bad: withFunction.callFunction(incompatible, { text: 'hello', prefix: 'Hi ' }),
      })
      .collect(),
    (error) => error instanceof CatalogError && error.detail.error_code === 'FUNCTION_NOT_FOUND',
  );
  const constant = defineCatalogFunction('udf_fixture.constant', {}, { type: 'int' });
  assert.deepEqual(
    await withFunction
      .query()
      .selectExpressions({
        answer: withFunction.callFunction(constant, {}),
      })
      .limit(1)
      .collect(),
    [{ answer: 42 }],
  );
  console.log(
    'Pixeltable integration passed: OpenAPI, insert, query, compute, update, delete, upload, jobs, validation, authenticated backend, catalog operations.',
  );
} finally {
  if (service.exitCode === null) service.kill('SIGTERM');
  await exited;
  await rm(temp, { recursive: true, force: true });
}
