import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { CatalogArray } from '../dist/catalog-array.js';
import { encodeBinaryParts } from '../dist/catalog-binary.js';
import { decodeNpy, encodeNpy } from '../dist/catalog-npy.js';
import { createClient, multipartBody, PixeltableHttpError } from '../dist/index.js';

import { loadGeneratedClient, loadTypeScriptModule } from './load-generated.mjs';

import {
  createCatalogClient,
  CatalogError,
  CatalogStaleError,
  defineCatalogFunction,
  catalogArray,
  catalogUuid,
  catalogDate,
  catalogTimestamp,
} from '../dist/catalog.js';

if (!process.env.PXT_TEST_PYTHON)
  throw new Error('Set PXT_TEST_PYTHON to a Python executable with pixeltable[serve] installed');

const npyFixtures = JSON.parse(await readFile(new URL('./fixtures/catalog-npy.json', import.meta.url), 'utf8'));
const npyRoundTrip = spawnSync(
  process.env.PXT_TEST_PYTHON,
  [
    '-c',
    `
import base64, io, json, sys
import numpy as np
from pixeltable.service import proxy_protocol
for case in json.load(sys.stdin):
    original = np.load(io.BytesIO(base64.b64decode(case['original'])), allow_pickle=False)
    encoded = np.load(io.BytesIO(base64.b64decode(case['encoded'])), allow_pickle=False)
    assert original.dtype == encoded.dtype
    assert original.shape == encoded.shape
    assert original.tobytes(order='A') == encoded.tobytes(order='A')
    assert original.flags.f_contiguous == encoded.flags.f_contiguous
    transported = proxy_protocol.deserialize_value(case['wire'], [base64.b64decode(part) for part in case['parts']])
    assert original.dtype == transported.dtype
    assert original.shape == transported.shape
    assert original.tobytes(order='A') == transported.tobytes(order='A')
`,
  ],
  {
    input: JSON.stringify(
      Object.values(npyFixtures).map((fixture) => {
        const parts = [];
        const wire = encodeBinaryParts(CatalogArray.fromNpy(Buffer.from(fixture.npy, 'base64')), parts);
        return {
          original: fixture.npy,
          encoded: Buffer.from(encodeNpy(decodeNpy(Buffer.from(fixture.npy, 'base64')))).toString('base64'),
          wire,
          parts: parts.map((part) => Buffer.from(part).toString('base64')),
        };
      }),
    ),
    encoding: 'utf8',
    timeout: 30000,
  },
);
assert.equal(npyRoundTrip.status, 0, npyRoundTrip.stderr || String(npyRoundTrip.error));
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
  assert.deepEqual(await authored.insert([authoredRow]), { insertedRows: 1, errors: 0 });
  assert.equal(await authored.count(), 1);
  assert.deepEqual(await authored.collect(), [{ ...authoredRow, score: null }]);
  assert.deepEqual(await authored.collect({ limit: 0 }), []);
  await assert.rejects(stale.insert([{ ...authoredRow, id: 2 }]), { name: 'CatalogStaleError' });
  assert.equal(await authored.count(), 1);
  const reopened = await catalog.openTable('typescript_catalog/docs', schemaDefinition);
  assert.deepEqual(await reopened.insert([{ ...authoredRow, id: 2, score: 2.5 }]), { insertedRows: 1, errors: 0 });
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
  const searchSchema = { text: { type: 'string' } };
  const searchTable = await catalog.createTable('typescript_catalog/search', searchSchema);
  await searchTable.insert([{ text: 'aaa' }, { text: 'bbb' }, { text: 'ab' }]);
  await searchTable.addEmbeddingIndex('text', {
    embedding: 'udf_fixture.text_embedding',
    name: 'text_idx',
    precision: 'fp32',
  });
  const similarity = searchTable.columns.text.similarity('aaa', 'text_idx');
  const ranked = await searchTable
    .query()
    .selectExpressions({ text: searchTable.columns.text, score: similarity })
    .orderBy(similarity, 'desc')
    .limit(2)
    .collect();
  assert.deepEqual(
    ranked.map((row) => row.text),
    ['aaa', 'ab'],
  );
  assert.ok(Math.abs(ranked[0].score - 1) < 0.00001);
  assert.deepEqual(await searchTable.query().where(similarity.gt(0.9)).collect(), [{ text: 'aaa' }]);
  await searchTable.insert([{ text: 'aaaa' }]);
  assert.equal((await searchTable.query().where(similarity.gt(0.9)).collect()).length, 2);
  await assert.rejects(
    searchTable.addEmbeddingIndex('text', {
      embedding: 'udf_fixture.missing_embedding',
      name: 'missing',
    }),
    (error) => error instanceof CatalogError && error.detail.error_code === 'FUNCTION_NOT_FOUND',
  );
  const staleSearch = await catalog.openTable('typescript_catalog/search', searchSchema);
  await searchTable.update({ text: 'bb' }, { where: searchTable.columns.text.eq('aaa') });
  await assert.rejects(
    staleSearch.addEmbeddingIndex('text', {
      embedding: 'udf_fixture.text_embedding',
      name: 'stale_idx',
    }),
    CatalogStaleError,
  );
  assert.deepEqual(await searchTable.query().where(similarity.gt(0.9)).collect(), [{ text: 'aaaa' }]);
  await assert.rejects(
    searchTable.addEmbeddingIndex('text', {
      embedding: 'udf_fixture.text_embedding',
      name: 'text_idx',
    }),
    CatalogError,
  );
  await searchTable.addEmbeddingIndex('text', {
    embedding: 'udf_fixture.text_embedding',
    name: 'text_idx',
    ifExists: 'ignore',
  });
  const searchView = await searchTable.createView('typescript_catalog/search_view');
  await searchView.addEmbeddingIndex('text', {
    embedding: 'udf_fixture.text_embedding',
    name: 'view_idx',
    metric: 'l2',
    precision: 'fp32',
  });
  const distance = searchView.columns.text.similarity('aaaa', 'view_idx');
  assert.deepEqual(await searchView.query().select('text').orderBy(distance, 'asc').limit(1).collect(), [
    { text: 'aaaa' },
  ]);
  await searchTable.dropIndex('text_idx');
  await assert.rejects(searchTable.query().selectExpressions({ score: similarity }).collect(), CatalogError);
  await catalog.createDirectory('typescript_lifecycle');
  const lifecycleSchema = { id: { type: 'int' } };
  const lifecycle = await catalog.createTable('typescript_lifecycle/source', lifecycleSchema);
  await lifecycle.insert([{ id: 7 }]);
  await lifecycle.createView('typescript_lifecycle/dependent');
  await assert.rejects(catalog.dropTable('typescript_lifecycle/source'), CatalogError);
  await assert.rejects(catalog.dropDirectory('typescript_lifecycle'), CatalogError);
  await catalog.move('typescript_lifecycle/source', 'typescript_lifecycle/renamed');
  const movedTable = await catalog.openTable('typescript_lifecycle/renamed', lifecycleSchema);
  assert.equal(movedTable.id, lifecycle.id);
  assert.deepEqual(await movedTable.collect(), [{ id: 7 }]);
  await assert.rejects(catalog.openTable('typescript_lifecycle/source', lifecycleSchema), CatalogError);
  assert.deepEqual(await (await catalog.openView('typescript_lifecycle/dependent', lifecycleSchema)).collect(), [
    { id: 7 },
  ]);
  await assert.rejects(catalog.move('typescript_lifecycle/renamed', 'typescript_lifecycle/dependent'), CatalogError);
  await catalog.move('typescript_lifecycle/renamed', 'typescript_lifecycle/dependent', { ifExists: 'ignore' });
  assert.equal((await catalog.openTable('typescript_lifecycle/renamed', lifecycleSchema)).id, lifecycle.id);
  await catalog.move('typescript_lifecycle/absent', 'typescript_lifecycle/unused', { ifNotExists: 'ignore' });
  await assert.rejects(catalog.move('typescript_lifecycle/absent', 'typescript_lifecycle/unused'), CatalogError);
  await catalog.move('typescript_lifecycle', 'typescript_lifecycle_moved');
  await assert.rejects(catalog.listDirectory('typescript_lifecycle'), CatalogError);
  await catalog.dropTable('typescript_lifecycle_moved/renamed', { force: true });
  assert.deepEqual(await catalog.listDirectory('typescript_lifecycle_moved'), []);
  await catalog.dropTable('typescript_lifecycle_moved/renamed', { ifNotExists: 'ignore' });
  await assert.rejects(catalog.dropTable('typescript_lifecycle_moved/renamed'), CatalogError);
  await catalog.createTable('typescript_lifecycle_moved/cleanup', lifecycleSchema);
  await catalog.dropDirectory('typescript_lifecycle_moved', { force: true });
  await catalog.dropDirectory('typescript_lifecycle_moved', { ifNotExists: 'ignore' });
  await assert.rejects(catalog.dropDirectory('typescript_lifecycle_moved'), CatalogError);
  const failedRows = await catalog.openTable('sdk_test/errors', {
    text: { type: 'string' },
    number: { type: 'int', computed: true },
  });
  const errorRows = await failedRows
    .query()
    .where(failedRows.columns.number.errorType.ne(null))
    .selectExpressions({
      text: failedRows.columns.text,
      error_type: failedRows.columns.number.errorType,
      error_message: failedRows.columns.number.errorMessage,
    })
    .collect();
  assert.equal(errorRows.length, 1);
  assert.equal(errorRows[0].text, 'invalid');
  assert.equal(errorRows[0].error_type, 'ValueError');
  assert.match(errorRows[0].error_message, /invalid literal/);
  assert.deepEqual(
    await failedRows
      .query()
      .where(failedRows.columns.text.eq('42'))
      .selectExpressions({ error_type: failedRows.columns.number.errorType })
      .collect(),
    [{ error_type: null }],
  );
  const failedRetry = await failedRows.recomputeColumns(['number'], { errorsOnly: true });
  assert.equal(failedRetry.updatedRows, 1);
  assert.equal(failedRetry.errors, 1);
  const successRetry = await failedRows.recomputeColumns(['number'], { where: failedRows.columns.text.eq('42') });
  assert.equal(successRetry.updatedRows, 1);
  assert.equal(successRetry.errors, 0);
  const staleErrors = await catalog.openTable('sdk_test/errors', failedRows.schema);
  await failedRows.recomputeColumns(['number'], { errorsOnly: true });
  await assert.rejects(staleErrors.recomputeColumns(['number']), CatalogStaleError);
  const retryView = await failedRows.createView('sdk_test/retry_view', { where: failedRows.columns.text.eq('42') });
  const retryDerived = await retryView.addComputedColumn('doubled', retryView.columns.number.multiply(2));
  await assert.rejects(retryDerived.recomputeColumns(['number']), /base table/);
  assert.deepEqual(await retryDerived.recomputeColumns(['doubled']), { updatedRows: 1, errors: 0 });
  const recovered = await catalog.openTable('sdk_test/retry', {
    value: { type: 'int' },
    result: { type: 'int', computed: true },
    dependent: { type: 'int', computed: true },
  });
  assert.equal(await recovered.query().where(recovered.columns.result.errorType.ne(null)).count(), 1);
  assert.deepEqual(await recovered.recomputeColumns(['result'], { errorsOnly: true }), { updatedRows: 1, errors: 0 });
  assert.deepEqual(await recovered.collect(), [{ value: 4, result: 8, dependent: 9 }]);
  assert.equal(await recovered.query().where(recovered.columns.result.errorType.ne(null)).count(), 0);
  assert.deepEqual(await recovered.recomputeColumns(['result'], { errorsOnly: true }), { updatedRows: 0, errors: 0 });
  const recoveryView = await recovered.createView('sdk_test/recovery_view');
  const recoveryDerived = await recoveryView.addComputedColumn('tripled', recoveryView.columns.result.multiply(3));
  assert.deepEqual(await recovered.recomputeColumns(['result']), { updatedRows: 2, errors: 0 });
  assert.deepEqual(await recoveryDerived.query().select('tripled').collect(), [{ tripled: 24 }]);
  assert.deepEqual(await recovered.recomputeColumns(['result'], { cascade: false }), { updatedRows: 1, errors: 0 });
  for (const columns of [[], ['value'], ['result', 'result'], ['unknown']])
    await assert.rejects(recovered.recomputeColumns(columns), TypeError);
  await assert.rejects(recovered.recomputeColumns(['result', 'dependent'], { errorsOnly: true }), TypeError);
  await assert.rejects(recovered.recomputeColumns(['result'], { cascade: 'false' }), TypeError);
  const ingestSource = await catalog.createTable('sdk_test/ingest_errors', { text: { type: 'string' } });
  const parseNumber = defineCatalogFunction('udf_fixture.parse_number', { text: { type: 'string' } }, { type: 'int' });
  const ingest = await ingestSource.addComputedColumn(
    'number',
    ingestSource.callFunction(parseNumber, { text: ingestSource.columns.text }),
  );
  await assert.rejects(ingest.insert([{ text: '7' }, { text: 'bad' }]), CatalogError);
  assert.equal(await ingest.count(), 0);
  assert.deepEqual(await ingest.insert([{ text: '8' }, { text: 'bad' }], { onError: 'ignore' }), {
    insertedRows: 2,
    errors: 1,
  });
  assert.equal(await ingest.count(), 2);
  assert.deepEqual(await ingest.query().where(ingest.columns.number.errorType.ne(null)).select('text').collect(), [
    { text: 'bad' },
  ]);
  await ingest.update({ text: '9' }, { where: ingest.columns.text.eq('bad') });
  assert.deepEqual(await ingest.query().select('number').orderBy('number').collect(), [{ number: 8 }, { number: 9 }]);
  assert.equal(await ingest.query().where(ingest.columns.number.errorType.ne(null)).count(), 0);
  await assert.rejects(ingest.insert([{ text: '3' }], { onError: 'skip' }), TypeError);
  const ingestView = await ingest.createView('sdk_test/ingest_error_view');
  await ingestView.addComputedColumn(
    'parsed_again',
    ingestView.callFunction(parseNumber, { text: ingestView.columns.text }),
  );
  assert.deepEqual(await ingest.insert([{ text: 'bad_again' }], { onError: 'ignore' }), { insertedRows: 1, errors: 2 });
  const snapshotSchema = { id: { type: 'int' }, text: { type: 'string' } };
  const snapshotSource = await catalog.createTable('sdk_test/snapshot_source', snapshotSchema);
  await snapshotSource.insert([
    { id: 1, text: 'before' },
    { id: 2, text: 'two' },
  ]);
  const frozen = await snapshotSource.createSnapshot('sdk_test/frozen');
  const filteredFrozen = await snapshotSource.createSnapshot('sdk_test/filtered_frozen', {
    where: snapshotSource.columns.id.eq(1),
  });
  assert.notEqual(frozen.id, snapshotSource.id);
  assert.equal('insert' in frozen, false);
  assert.equal('recomputeColumns' in frozen, false);
  assert.deepEqual(await filteredFrozen.collect(), [{ id: 1, text: 'before' }]);
  await snapshotSource.update({ text: 'after' });
  await snapshotSource.delete({ where: snapshotSource.columns.id.eq(2) });
  await snapshotSource.insert([{ id: 3, text: 'new' }]);
  assert.deepEqual(await frozen.query().orderBy('id').collect(), [
    { id: 1, text: 'before' },
    { id: 2, text: 'two' },
  ]);
  assert.deepEqual(await filteredFrozen.collect(), [{ id: 1, text: 'before' }]);
  const reopenedFrozen = await catalog.openSnapshot('sdk_test/frozen', snapshotSchema);
  assert.equal(reopenedFrozen.id, frozen.id);
  assert.equal(await reopenedFrozen.count(), 2);
  assert.throws(() => frozen.query().where(snapshotSource.columns.id.eq(1)), TypeError);
  await assert.rejects(catalog.openView('sdk_test/frozen', snapshotSchema), /live view/);
  await assert.rejects(catalog.openSnapshot('sdk_test/snapshot_source', snapshotSchema), TypeError);
  const secondFrozen = await frozen.createSnapshot('sdk_test/second_frozen');
  assert.deepEqual(await secondFrozen.query().where(secondFrozen.columns.id.eq(2)).collect(), [{ id: 2, text: 'two' }]);
  const sourceView = await snapshotSource.createView('sdk_test/snapshot_view');
  const derivedView = await sourceView.addComputedColumn('twice', sourceView.columns.id.multiply(2));
  const frozenView = await derivedView.createSnapshot('sdk_test/frozen_view');
  await snapshotSource.update({ id: 4 }, { where: snapshotSource.columns.id.eq(1) });
  assert.deepEqual(await frozenView.query().select('id', 'twice').orderBy('id').collect(), [
    { id: 1, twice: 2 },
    { id: 3, twice: 6 },
  ]);
  await assert.rejects(catalog.dropTable('sdk_test/snapshot_view'), CatalogError);
  await catalog.dropTable('sdk_test/snapshot_view', { force: true });
  await assert.rejects(frozenView.count(), CatalogError);
  await snapshotSource.renameColumn('text', 'renamed_text');
  assert.deepEqual(await (await catalog.openSnapshot('sdk_test/filtered_frozen', snapshotSchema)).collect(), [
    { id: 1, text: 'before' },
  ]);
  const membership = await catalog.createTable('sdk_test/membership', {
    id: { type: 'int' },
    score: { type: 'float', nullable: true },
    choices: { type: 'json' },
  });
  await membership.insert([
    { id: 1, score: 1.5, choices: [1, 3] },
    { id: 2, score: null, choices: [3] },
    { id: 3, score: 3, choices: [3] },
  ]);
  assert.deepEqual(
    await membership
      .query()
      .where(membership.columns.id.isIn([1, 3]))
      .select('id')
      .orderBy('id')
      .collect(),
    [{ id: 1 }, { id: 3 }],
  );
  assert.equal(await membership.query().where(membership.columns.id.isIn([])).count(), 0);
  assert.deepEqual(
    await membership
      .query()
      .where(membership.columns.score.isIn([3, 1.5]))
      .select('id')
      .orderBy('id')
      .collect(),
    [{ id: 1 }, { id: 3 }],
  );
  assert.equal(
    await membership
      .query()
      .where(membership.columns.score.isIn([3, null]).not())
      .count(),
    0,
  );
  assert.equal(
    await membership
      .query()
      .where(membership.columns.score.isIn([null]))
      .count(),
    0,
  );
  assert.deepEqual(
    await membership
      .query()
      .where(membership.columns.id.isIn([1, 3]).not())
      .select('id')
      .collect(),
    [{ id: 2 }],
  );
  assert.deepEqual(
    await membership
      .query()
      .where(membership.columns.id.isIn(membership.columns.choices))
      .select('id')
      .orderBy('id')
      .collect(),
    [{ id: 1 }, { id: 3 }],
  );
  assert.deepEqual(await membership.update({ score: 9 }, { where: membership.columns.id.isIn([1, 3]) }), {
    updatedRows: 2,
  });
  assert.deepEqual(await membership.delete({ where: membership.columns.id.isIn([2]) }), { deletedRows: 1 });
  const backfillSchema = { text: { type: 'string' } };
  const backfill = await catalog.createTable('sdk_test/backfill', backfillSchema);
  await backfill.insert([{ text: '10' }, { text: 'bad' }]);
  const parsed = backfill.callFunction(parseNumber, { text: backfill.columns.text });
  await assert.rejects(backfill.addComputedColumn('number', parsed), CatalogError);
  assert.equal(await (await catalog.openTable('sdk_test/backfill', backfillSchema)).count(), 2);
  await assert.rejects(backfill.addComputedColumn('number', parsed, { onError: 'skip' }), TypeError);
  const backfilled = await backfill.addComputedColumn('number', parsed, { onError: 'ignore' });
  assert.equal(await backfilled.query().where(backfilled.columns.number.errorType.ne(null)).count(), 1);
  assert.deepEqual(await backfilled.query().where(backfilled.columns.text.eq('10')).select('number').collect(), [
    { number: 10 },
  ]);
  await assert.rejects(backfill.insert([{ text: '11' }]), CatalogStaleError);
  await backfilled.update({ text: '12' }, { where: backfilled.columns.text.eq('bad') });
  assert.equal(await backfilled.query().where(backfilled.columns.number.errorType.ne(null)).count(), 0);
  const backfillView = await backfilled.createView('sdk_test/backfill_view');
  const invalidNumber = backfillView.callFunction(parseNumber, { text: 'not_a_number' });
  const failedView = await backfillView.addComputedColumn('failed', invalidNumber, { onError: 'ignore' });
  assert.equal(await failedView.query().where(failedView.columns.failed.errorType.ne(null)).count(), 2);
  const beforeCompute = await backfilled.getVersions();
  assert.deepEqual(await backfilled.compute([{ text: '21' }]), [{ values: { text: '21', number: 21 }, errors: {} }]);
  await assert.rejects(backfilled.compute([{ text: 'bad' }]), CatalogError);
  const computedErrors = await backfilled.compute([{ text: 'bad' }], { onError: 'ignore' });
  assert.deepEqual(computedErrors[0].values, { text: 'bad', number: null });
  assert.equal(computedErrors[0].errors.number.type, 'ValueError');
  assert.match(computedErrors[0].errors.number.message, /invalid literal/);
  assert.equal(await backfilled.count(), 2);
  assert.deepEqual(await backfilled.getVersions(), beforeCompute);
  const computeView = await backfilled.createView('sdk_test/compute_view', { where: backfilled.columns.number.gt(10) });
  assert.deepEqual(await computeView.compute([{ text: '1' }, { text: '20' }]), [
    { values: { text: '20', number: 20 }, errors: {} },
  ]);
  await assert.rejects(backfilled.compute([]), TypeError);
  const batchSource = await catalog.createTable('sdk_test/batch', {
    id: { type: 'int', primaryKey: true },
    value: { type: 'int' },
  });
  const batch = await batchSource.addComputedColumn('doubled', batchSource.columns.value.multiply(2));
  await batch.insert([
    { id: 1, value: 2 },
    { id: 2, value: 3 },
  ]);
  assert.deepEqual(
    await batch.batchUpdate([
      { id: 1, value: 4 },
      { id: 2, value: 5 },
    ]),
    { updatedRows: 2, insertedRows: 0, errors: 0 },
  );
  assert.deepEqual(await batch.query().select('doubled').orderBy('id').collect(), [{ doubled: 8 }, { doubled: 10 }]);
  await assert.rejects(
    batch.batchUpdate([
      { id: 1, value: 100 },
      { id: 99, value: 1 },
    ]),
    CatalogError,
  );
  assert.deepEqual(await batch.query().where(batch.columns.id.eq(1)).select('value').collect(), [{ value: 4 }]);
  assert.deepEqual(await batch.batchUpdate([{ id: 99, value: 1 }], { ifNotExists: 'ignore' }), {
    updatedRows: 0,
    insertedRows: 0,
    errors: 0,
  });
  assert.deepEqual(
    await batch.batchUpdate(
      [
        { id: 2, value: 6 },
        { id: 3, value: 7 },
      ],
      { ifNotExists: 'insert' },
    ),
    { updatedRows: 1, insertedRows: 1, errors: 0 },
  );
  const staleBatch = await catalog.openTable('sdk_test/batch', batch.schema);
  await batch.batchUpdate([{ id: 1, value: 9 }], { cascade: false });
  assert.deepEqual(await batch.query().where(batch.columns.id.eq(1)).select('value', 'doubled').collect(), [
    { value: 9, doubled: 8 },
  ]);
  await assert.rejects(staleBatch.batchUpdate([{ id: 1, value: 10 }]), CatalogStaleError);
  await assert.rejects(batch.batchUpdate([{ value: 1 }]), TypeError);
  await assert.rejects(batch.batchUpdate([{ id: 1, doubled: 8 }]), TypeError);
  const composite = await catalog.createTable('sdk_test/composite', {
    tenant: { type: 'string', primaryKey: true },
    id: { type: 'int', primaryKey: true },
    value: { type: 'int' },
  });
  await composite.insert([
    { tenant: 'a', id: 1, value: 1 },
    { tenant: 'b', id: 1, value: 2 },
  ]);
  await composite.batchUpdate([{ tenant: 'a', id: 1, value: 3 }]);
  assert.deepEqual(await composite.query().select('value').orderBy('tenant').collect(), [{ value: 3 }, { value: 2 }]);
  await assert.rejects(composite.batchUpdate([{ id: 1, value: 4 }]), TypeError);
  await assert.rejects(composite.batchUpdate([], { ifNotExists: 'insert' }), TypeError);
  await assert.rejects(composite.batchUpdate([{ tenant: 'a', id: 1 }], { cascade: 'false' }), TypeError);
  const batchView = await batch.createView('sdk_test/batch_view');
  await batchView.addComputedColumn('tripled', batchView.columns.value.multiply(3));
  assert.deepEqual(await batch.batchUpdate([{ id: 4, value: 2 }], { ifNotExists: 'insert' }), {
    updatedRows: 0,
    insertedRows: 2,
    errors: 0,
  });
  const jsonSource = await catalog.createTable('sdk_test/json_paths', {
    id: { type: 'int' },
    payload: { type: 'json' },
  });
  await jsonSource.insert([
    { id: 1, payload: { score: 2.5, items: [{ name: 'a' }, {}, { name: 'c' }] } },
    { id: 2, payload: { items: [] } },
    { id: 3, payload: { score: 1, items: [{ name: 'd' }] } },
  ]);
  const json = jsonSource.columns.payload;
  const score = json.jsonPath('score').asType({ type: 'float', nullable: true });
  assert.deepEqual(
    await jsonSource
      .query()
      .selectExpressions({
        first: json.jsonPath('items', 0, 'name'),
        last: json.jsonPath('items', -1, 'name'),
        names: json.jsonPath('items', '*', 'name'),
        reverse: json.jsonPath('items', { step: -1 }, 'name'),
        score,
      })
      .orderBy('id')
      .collect(),
    [
      { first: 'a', last: 'c', names: ['a', null, 'c'], reverse: ['c', null, 'a'], score: 2.5 },
      { first: null, last: null, names: [], reverse: [], score: null },
      { first: 'd', last: 'd', names: ['d'], reverse: ['d'], score: 1 },
    ],
  );
  assert.deepEqual(await jsonSource.query().where(score.eq(2.5)).select('id').collect(), [{ id: 1 }]);
  await assert.rejects(jsonSource.query().where(score.gt(2)).collect(), /NoneType/);
  const jsonComputed = await jsonSource.addComputedColumn('score', score);
  assert.deepEqual(await jsonComputed.query().where(jsonComputed.columns.score.gt(2)).select('id').collect(), [
    { id: 1 },
  ]);
  await jsonComputed.update({ payload: { score: 4 } }, { where: jsonComputed.columns.id.eq(1) });
  assert.deepEqual(await jsonComputed.query().select('score').orderBy('id').collect(), [
    { score: 4 },
    { score: null },
    { score: 1 },
  ]);
  await assert.rejects(jsonComputed.insert([{ id: 4, payload: { score: 'not a number' } }]));
  assert.equal(await jsonComputed.count(), 3);
  await assert.rejects(
    jsonSource
      .query()
      .selectExpressions({
        required: json.jsonPath('absent').asType({ type: 'int' }),
      })
      .collect(),
  );
  const sales = await catalog.createTable('sdk_test/sales', {
    category: { type: 'string' },
    amount: { type: 'int', nullable: true },
  });
  await sales.insert([
    { category: 'a', amount: 2 },
    { category: 'a', amount: 4 },
    { category: 'a', amount: null },
    { category: 'b', amount: 9 },
    { category: 'c', amount: null },
  ]);
  const uniqueCategories = sales.query().select('category').distinct().orderBy('category');
  assert.deepEqual(await uniqueCategories.collect(), [{ category: 'a' }, { category: 'b' }, { category: 'c' }]);
  assert.equal(await uniqueCategories.count(), 3);
  assert.deepEqual(await uniqueCategories.limit(1).offset(1).collect(), [{ category: 'b' }]);
  assert.equal(await sales.query().select('amount').distinct().count(), 4);
  assert.equal(await sales.query().where(sales.columns.amount.gt(100)).distinct().count(), 0);
  assert.equal(await sales.query().distinct().count(), 5);
  assert.deepEqual(
    await sales
      .query()
      .selectExpressions({ remainder: sales.columns.amount.modulo(2) })
      .distinct()
      .collect()
      .then((rows) => rows.sort((a, b) => (a.remainder ?? -1) - (b.remainder ?? -1))),
    [{ remainder: null }, { remainder: 0 }, { remainder: 1 }],
  );
  const summaries = {
    category: sales.columns.category,
    total: sales.columns.amount.aggregate('sum'),
    average: sales.columns.amount.aggregate('mean'),
    lowest: sales.columns.amount.aggregate('min'),
    highest: sales.columns.amount.aggregate('max'),
    present: sales.columns.amount.aggregate('count'),
  };
  const grouped = sales.query().groupBy('category').selectExpressions(summaries).orderBy('category');
  assert.deepEqual(await grouped.collect(), [
    { category: 'a', total: 6, average: 3, lowest: 2, highest: 4, present: 2 },
    { category: 'b', total: 9, average: 9, lowest: 9, highest: 9, present: 1 },
    { category: 'c', total: null, average: null, lowest: null, highest: null, present: 0 },
  ]);
  assert.equal(await grouped.count(), 3);
  assert.deepEqual(await grouped.limit(1).offset(1).collect(), [
    { category: 'b', total: 9, average: 9, lowest: 9, highest: 9, present: 1 },
  ]);
  assert.deepEqual(
    await sales
      .query()
      .where(sales.columns.category.eq('absent'))
      .selectExpressions({
        total: summaries.total,
        present: summaries.present,
      })
      .collect(),
    [{ total: null, present: 0 }],
  );
  assert.deepEqual(await sales.query().selectExpressions({ total: summaries.total }).collect(), [{ total: 15 }]);
  assert.deepEqual(
    await sales
      .query()
      .groupBy(sales.columns.category)
      .where(sales.columns.amount.gt(2))
      .selectExpressions({ category: sales.columns.category, total: summaries.total })
      .orderBy('category')
      .collect(),
    [
      { category: 'a', total: 4 },
      { category: 'b', total: 9 },
    ],
  );
  assert.deepEqual(
    await sales
      .query()
      .selectExpressions({
        first: sales.columns.category.aggregate('min'),
        last: sales.columns.category.aggregate('max'),
      })
      .collect(),
    [{ first: 'a', last: 'c' }],
  );
  await assert.rejects(sales.query().groupBy('category').select('amount').collect());
  await assert.rejects(
    sales
      .query()
      .selectExpressions({ nested: summaries.total.aggregate('sum') })
      .collect(),
  );
  const events = await catalog.createTable('sdk_test/window_events', {
    id: { type: 'int' },
    category: { type: 'string' },
    amount: { type: 'int', nullable: true },
  });
  await events.insert([
    { id: 4, category: 'b', amount: 7 },
    { id: 2, category: 'a', amount: null },
    { id: 3, category: 'a', amount: 5 },
    { id: 1, category: 'a', amount: 2 },
    { id: 5, category: 'b', amount: 1 },
  ]);
  const window = { partitionBy: events.columns.category, orderBy: events.columns.id };
  const running = events.columns.amount.aggregate('sum', window);
  const runningQuery = events
    .query()
    .selectExpressions({
      id: events.columns.id,
      running,
      seen: events.columns.amount.aggregate('count', window),
      low: events.columns.amount.aggregate('min', window),
      high: events.columns.amount.aggregate('max', window),
    })
    .orderBy('category')
    .orderBy('id');
  await assert.rejects(events.query().selectExpressions({ running }).orderBy('id').collect(), /Incompatible ordering/);
  assert.deepEqual(await runningQuery.collect(), [
    { id: 1, running: 2, seen: 1, low: 2, high: 2 },
    { id: 2, running: 2, seen: 1, low: 2, high: 2 },
    { id: 3, running: 7, seen: 2, low: 2, high: 5 },
    { id: 4, running: 7, seen: 1, low: 7, high: 7 },
    { id: 5, running: 8, seen: 2, low: 1, high: 7 },
  ]);
  assert.deepEqual(
    await events
      .query()
      .selectExpressions({
        id: events.columns.id,
        running: events.columns.amount.aggregate('sum', { orderBy: events.columns.id }),
      })
      .orderBy('id')
      .collect(),
    [
      { id: 1, running: 2 },
      { id: 2, running: 2 },
      { id: 3, running: 7 },
      { id: 4, running: 14 },
      { id: 5, running: 15 },
    ],
  );
  assert.deepEqual(await runningQuery.where(events.columns.id.gt(2)).collect(), [
    { id: 3, running: 5, seen: 1, low: 5, high: 5 },
    { id: 4, running: 7, seen: 1, low: 7, high: 7 },
    { id: 5, running: 8, seen: 2, low: 1, high: 7 },
  ]);
  const calendarSchema = { id: { type: 'int' }, day: { type: 'date' }, at: { type: 'timestamp', nullable: true } };
  const calendar = await catalog.createTable('sdk_test/calendar', calendarSchema);
  const day = catalogDate('2026-09-22');
  const instant = catalogTimestamp('2026-09-22T05:30:01.123456-07:00');
  const later = catalogTimestamp('2026-09-22T12:30:01.123457Z');
  await calendar.insert([
    { id: 1, day, at: instant },
    { id: 2, day, at: later },
    { id: 3, day, at: null },
  ]);
  const reopenedCalendar = await catalog.openTable('sdk_test/calendar', calendarSchema);
  assert.deepEqual(await reopenedCalendar.query().orderBy('id').collect(), [
    { id: 1, day, at: instant },
    { id: 2, day, at: later },
    { id: 3, day, at: null },
  ]);
  assert.deepEqual(await calendar.query().where(calendar.columns.at.lt(later)).select('id').collect(), [{ id: 1 }]);
  assert.deepEqual(
    await calendar
      .query()
      .where(calendar.columns.at.isIn([instant]))
      .select('id')
      .collect(),
    [{ id: 1 }],
  );
  assert.equal(
    await calendar
      .query()
      .where(calendar.columns.day.isIn([day]))
      .count(),
    3,
  );
  await calendar.addBtreeIndex('day', { name: 'day_idx' });
  await calendar.addBtreeIndex('at', { name: 'at_idx' });
  const copied = await calendar.addComputedColumn('copy', calendar.columns.at);
  assert.deepEqual(await copied.query().select('copy').orderBy('id').collect(), [
    { copy: instant },
    { copy: later },
    { copy: null },
  ]);
  await copied.update({ at: later }, { where: copied.columns.id.eq(1) });
  assert.deepEqual(await copied.query().where(copied.columns.id.eq(1)).select('copy').collect(), [{ copy: later }]);
  assert.deepEqual(
    await copied
      .query()
      .selectExpressions({ first: copied.columns.at.aggregate('min') })
      .collect(),
    [{ first: later }],
  );
  const year = copied.callFunction(
    defineCatalogFunction('pixeltable.functions.timestamp.year', { self: { type: 'timestamp' } }, { type: 'int' }),
    { self: instant },
  );
  assert.deepEqual(await copied.query().selectExpressions({ year }).limit(1).collect(), [{ year: 2026 }]);
  const preview = await copied.compute([{ id: 4, day, at: instant }]);
  assert.equal(preview[0].values.copy, instant);
  const joinLeft = await catalog.createTable('sdk_test/join_left', { key: { type: 'int' }, label: { type: 'string' } });
  const joinRight = await catalog.createTable('sdk_test/join_right', { key: { type: 'int' }, amount: { type: 'int' } });
  await joinLeft.insert([
    { key: 1, label: 'one' },
    { key: 2, label: 'two' },
  ]);
  await joinRight.insert([
    { key: 2, amount: 20 },
    { key: 3, amount: 30 },
  ]);
  const joinCases = JSON.parse(await readFile(new URL('./fixtures/catalog-joins.json', import.meta.url), 'utf8'));
  for (const how of ['inner', 'left', 'full_outer', 'cross']) {
    const joined = catalog.join(joinLeft, joinRight, {
      how,
      ...(how === 'cross' ? {} : { on: ({ left, right }) => left.key.eq(right.key) }),
    });
    const { left, right } = joined.columns;
    const rows = await joined
      .query()
      .selectExpressions({ left_key: left.key, label: left.label, right_key: right.key, amount: right.amount })
      .collect();
    rows.sort((a, b) => (a.left_key ?? 0) - (b.left_key ?? 0) || (a.right_key ?? 0) - (b.right_key ?? 0));
    assert.deepEqual(rows, joinCases[how].rows);
    assert.equal(await joined.query().count(), rows.length);
    if (how === 'left') {
      assert.deepEqual(await joined.query().where(right.key.isNull()).select('left_label').collect(), [
        { left_label: 'one' },
      ]);
      assert.deepEqual(
        await joined
          .query()
          .selectExpressions({ adjusted: right.amount.add(1) })
          .orderBy('left_key')
          .collect(),
        [{ adjusted: null }, { adjusted: 21 }],
      );
      assert.throws(() => joined.query().where(joinLeft.columns.key.eq(1)), /belong/);
    }
  }
  assert.throws(() => catalog.join(joinLeft, joinRight, { how: 'inner' }), /require/);
  assert.throws(
    () => catalog.join(joinLeft, joinRight, { how: 'cross', on: () => joinLeft.columns.key.eq(1) }),
    /omit/,
  );
  assert.throws(() => catalog.join(joinLeft, joinLeft, { how: 'cross' }), /Self joins/);
  assert.throws(() => catalog.join(joinLeft, { ...joinRight }, { how: 'cross' }), /handles/);
  const joinView = await joinLeft.createView('sdk_test/join_view', { where: joinLeft.columns.key.gt(1) });
  const viewJoin = catalog.join(joinView, joinRight, { how: 'inner', on: ({ left, right }) => left.key.eq(right.key) });
  assert.deepEqual(await viewJoin.query().select('left_label', 'right_amount').collect(), [
    { left_label: 'two', right_amount: 20 },
  ]);
  const joinFrozen = await joinRight.createSnapshot('sdk_test/join_frozen');
  await joinRight.update({ amount: 99 });
  const snapshotJoin = catalog.join(joinLeft, joinFrozen, {
    how: 'inner',
    on: ({ left, right }) => left.key.eq(right.key),
  });
  assert.deepEqual(await snapshotJoin.query().select('right_amount').collect(), [{ right_amount: 20 }]);
  const binary = await catalog.createTable('sdk_test/binary_values', {
    id: { type: 'int', primaryKey: true },
    content: { type: 'binary' },
    optional: { type: 'binary', nullable: true },
  });
  const bytes = new Uint8Array([7, 0, 255, 16, 8]).subarray(1, 4);
  await binary.insert([
    { id: 1, content: bytes },
    { id: 2, content: new Uint8Array(), optional: bytes },
  ]);
  assert.deepEqual(await binary.query().orderBy('id').collect(), [
    { id: 1, content: bytes, optional: null },
    { id: 2, content: new Uint8Array(), optional: bytes },
  ]);
  assert.equal(await binary.query().where(binary.columns.content.eq(bytes)).count(), 1);
  const binaryCopy = await binary.addComputedColumn('copy', binary.columns.content);
  assert.deepEqual((await binaryCopy.query().where(binaryCopy.columns.id.eq(1)).collect())[0].copy, bytes);
  await binaryCopy.update({ content: new Uint8Array([42]) }, { where: binaryCopy.columns.id.eq(1) });
  assert.deepEqual(
    (await binaryCopy.query().where(binaryCopy.columns.id.eq(1)).collect())[0].copy,
    new Uint8Array([42]),
  );
  await binaryCopy.batchUpdate([{ id: 2, content: bytes }]);
  assert.deepEqual((await binaryCopy.compute([{ id: 3, content: bytes }]))[0].values.copy, bytes);
  const openedBinary = await catalog.openTable('sdk_test/binary_values', binaryCopy.schema);
  assert.equal(await openedBinary.query().where(openedBinary.columns.content.eq(bytes)).count(), 1);
  const uuidTable = await catalog.createTable('sdk_test/uuid_values', {
    id: { type: 'uuid', primaryKey: true },
    optional: { type: 'uuid', nullable: true },
  });
  const uuidA = catalogUuid('ABCDEF01-2345-6789-ABCD-EF0123456789');
  const uuidB = catalogUuid('00000000000000000000000000000000');
  await uuidTable.insert([{ id: uuidA }, { id: uuidB, optional: uuidA }]);
  assert.deepEqual(await uuidTable.query().orderBy('id').collect(), [
    { id: uuidB, optional: uuidA },
    { id: uuidA, optional: null },
  ]);
  assert.equal(await uuidTable.query().where(uuidTable.columns.id.lt(uuidA)).count(), 1);
  assert.equal(
    await uuidTable
      .query()
      .where(uuidTable.columns.id.isIn([uuidA]))
      .count(),
    1,
  );
  await uuidTable.addBtreeIndex('id', { name: 'uuid_lookup' });
  const uuidCopy = await uuidTable.addComputedColumn('copy', uuidTable.columns.id);
  await uuidCopy.batchUpdate([{ id: uuidA, optional: uuidB }]);
  assert.deepEqual((await uuidCopy.query().where(uuidCopy.columns.id.eq(uuidA)).collect())[0], {
    id: uuidA,
    optional: uuidB,
    copy: uuidA,
  });
  await uuidCopy.update({ optional: uuidA }, { where: uuidCopy.columns.id.eq(uuidB) });
  assert.equal((await uuidCopy.compute([{ id: uuidA }]))[0].values.copy, uuidA);
  const uuidOpened = await catalog.openTable('sdk_test/uuid_values', uuidCopy.schema);
  assert.equal(await uuidOpened.query().where(uuidOpened.columns.copy.eq(uuidA)).count(), 1);
  const arrayTable = await catalog.createTable('sdk_test/arrays', {
    id: { type: 'int', primaryKey: true },
    vector: { type: 'array', dtype: 'float32', shape: [2] },
    loose: { type: 'array', nullable: true },
  });
  const vector = catalogArray(new Float32Array([1.5, -2]));
  const large = catalogArray(new BigInt64Array([-(2n ** 63n), 2n ** 63n - 1n]));
  await arrayTable.insert([{ id: 1, vector, loose: large }]);
  const arrayRows = await arrayTable.collect();
  assert.deepEqual(arrayRows[0].vector.data, vector.data);
  assert.deepEqual(arrayRows[0].vector.toTypedArray(), new Float32Array([1.5, -2]));
  assert.deepEqual(arrayRows[0].loose.toTypedArray(), new BigInt64Array([-(2n ** 63n), 2n ** 63n - 1n]));
  assert.deepEqual(arrayRows[0].loose.data, large.data);
  await assert.rejects(arrayTable.insert([{ id: 2, vector: catalogArray(new Float32Array(3)) }]), /shape/);
  await assert.rejects(arrayTable.insert([{ id: 2, vector: catalogArray(new Float64Array(2)) }]), /dtype/);
  const arrayCopy = await arrayTable.addComputedColumn('copy', arrayTable.columns.vector);
  const replacement = catalogArray(new Float32Array([3, 4]));
  await arrayCopy.update({ vector: replacement });
  assert.deepEqual((await arrayCopy.collect())[0].copy.data, replacement.data);
  await arrayCopy.batchUpdate([{ id: 1, vector }]);
  const arrayPreview = await arrayCopy.compute([{ id: 2, vector }]);
  assert.deepEqual(arrayPreview[0].values.copy.data, vector.data);
  const castArray = arrayCopy.columns.vector.asType({ type: 'array', dtype: 'float32', shape: [2] });
  assert.deepEqual(
    (await arrayCopy.query().selectExpressions({ cast: castArray }).collect())[0].cast.data,
    vector.data,
  );
  const reverseVector = arrayCopy.columns.vector.arraySlice({ step: -1 });
  assert.deepEqual(
    (await arrayCopy.query().selectExpressions({ reversed: reverseVector }).collect())[0].reversed.toTypedArray(),
    new Float32Array([-2, 1.5]),
  );
  const slicedCopy = await arrayCopy.addComputedColumn('slice_tail', arrayCopy.columns.vector.arraySlice({ start: 1 }));
  assert.deepEqual((await slicedCopy.collect())[0].slice_tail.toTypedArray(), new Float32Array([-2]));
  const arrayOpened = await catalog.openTable('sdk_test/arrays', slicedCopy.schema);
  assert.deepEqual((await arrayOpened.collect())[0].vector.data, vector.data);
  await assert.rejects(
    catalog.openTable('sdk_test/arrays', {
      ...slicedCopy.schema,
      vector: { type: 'array', dtype: 'float32', shape: [3] },
    }),
    /Schema mismatch/,
  );
  console.log(
    'Pixeltable integration passed: OpenAPI, insert, query, compute, update, delete, upload, jobs, validation, authenticated backend, catalog operations.',
  );
} finally {
  const postmaster = await readFile(join(temp, 'home', 'pgdata', 'postmaster.pid'), 'utf8').catch(() => null);
  const postgresPid = postmaster === null ? null : Number(postmaster.split('\n')[0]);
  if (service.exitCode === null) service.kill('SIGTERM');
  await exited;
  if (postgresPid !== null) {
    assert.ok(Number.isSafeInteger(postgresPid) && postgresPid > 0);
    assert.throws(
      () => process.kill(postgresPid, 0),
      { code: 'ESRCH' },
      'Temporary PostgreSQL must stop with the service',
    );
  }
  await rm(temp, { recursive: true, force: true });
}
