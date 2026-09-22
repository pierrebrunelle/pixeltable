import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../bin/generate.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/openapi.json', import.meta.url));

test('generator reproduces the checked-in service types, including Blob uploads', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pxt-codegen-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'nested', 'service.d.ts');
  execFileSync(process.execPath, [cli, fixture, '--output', output]);
  assert.equal(
    await readFile(output, 'utf8'),
    await readFile(new URL('./fixtures/service.d.ts', import.meta.url), 'utf8'),
  );
  assert.match(await readFile(output, 'utf8'), /Blob/);
});

test('generator rejects invalid input without replacing the output', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pxt-codegen-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'bad.json');
  const output = join(dir, 'types.d.ts');
  await writeFile(input, '{"not":"openapi"}');
  await writeFile(output, 'keep me');
  const result = spawnSync(process.execPath, [cli, input, '-o', output]);
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(output, 'utf8'), 'keep me');
  assert.notEqual(spawnSync(process.execPath, [cli]).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, '--help']).status, 0);
});

test('named calls reproduce the fixture and serialize requests, uploads, errors, and cancellation', async (t) => {
  const { loadGeneratedClient } = await import('./load-generated.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'pxt-codegen-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'client.ts');
  execFileSync(process.execPath, [cli, fixture, '--client', '-o', output]);
  assert.equal(
    await readFile(output, 'utf8'),
    await readFile(new URL('./fixtures/client.ts', import.meta.url), 'utf8'),
  );
  const { createServiceClient } = await loadGeneratedClient();
  const requests = [];
  let responseBody = { id: 1, title_upper: 'HELLO' };
  let responseStatus = 200;
  const client = createServiceClient({
    baseUrl: 'https://service.test/api',
    fetch: async (request, options) => {
      options.signal.throwIfAborted();
      requests.push(request);
      return Response.json(responseBody, { status: responseStatus });
    },
  });
  assert.deepEqual(await client.operations.insert_docs_docs_post({ id: 1, title: 'hello' }), responseBody);
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(await requests[0].json(), { id: 1, title: 'hello' });
  await client.operations.query_lookup_lookup_get({ id: 1 });
  assert.equal(requests[1].url, 'https://service.test/api/lookup?id=1');
  await client.operations.insert_upload_upload_post({ id: 2, title: 'image', image: new Blob(['pixels']) });
  const uploaded = await requests[2].formData();
  assert.equal(uploaded.get('id'), '2');
  assert.equal(await uploaded.get('image').text(), 'pixels');
  responseBody = null;
  assert.equal(await client.operations.compute_preview_preview_post({ id: 1, title: 'hello' }), null);
  responseBody = { detail: 'invalid' };
  responseStatus = 422;
  await assert.rejects(client.operations.insert_docs_docs_post({ id: 1, title: 'hello' }), { status: 422 });
  await assert.rejects(client.operations.query_lookup_lookup_get({ id: 1 }, { signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
});

test('unsupported named calls preserve existing output', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pxt-codegen-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const original = JSON.parse(await readFile(fixture, 'utf8'));
  const mutations = [
    (schema) => {
      schema.components.schemas.Body_insert_upload_upload_post.properties.image = {
        type: 'array',
        items: { type: 'string' },
      };
    },
    (schema) => {
      delete schema.paths['/docs'].post.operationId;
    },
    (schema) => {
      schema.paths['/docs'].post.operationId = schema.paths['/lookup'].get.operationId;
    },
    (schema) => {
      schema.paths['/lookup'].get.parameters[0].in = 'header';
    },
    (schema) => {
      schema.paths['/docs'].post.requestBody.required = false;
    },
    (schema) => {
      schema.paths['/docs'].post.responses['204'] = { description: 'Empty' };
    },
  ];
  const input = join(dir, 'schema.json');
  const output = join(dir, 'client.ts');
  await writeFile(output, 'keep me');
  for (const mutate of mutations) {
    const schema = structuredClone(original);
    mutate(schema);
    await writeFile(input, JSON.stringify(schema));
    assert.notEqual(spawnSync(process.execPath, [cli, input, '--client', '-o', output]).status, 0);
    assert.equal(await readFile(output, 'utf8'), 'keep me');
  }
  assert.notEqual(spawnSync(process.execPath, [cli, fixture, '--client', '-o', join(dir, 'client.d.ts')]).status, 0);
});
