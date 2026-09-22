import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createCatalogClient, CatalogError } from '../dist/catalog.js';
import {
  encodeProxyFrame,
  decodeProxyFrame,
  proxyProtocolVersion,
  proxySchemaVersion,
} from '../dist/proxy-protocol.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fixture = JSON.parse(await readFile(new URL('./fixtures/proxy.json', import.meta.url), 'utf8'));

function response(result, error = null) {
  return new Response(
    encodeProxyFrame(encoder.encode(JSON.stringify({ result, error, current_md: null, is_stale_md: false })), []),
  );
}

function entry(isDirectory, children = {}, tableId = null) {
  return {
    $pxt: 'DirEntry',
    v: {
      is_dir: isDirectory,
      table: tableId === null ? null : { id: { $pxt: 'UUID', v: tableId } },
      dir_entries: children,
      table_error_count: null,
    },
  };
}

test('framing matches Python protocol bytes and preserves opaque tags and binary parts', () => {
  assert.equal(proxyProtocolVersion, fixture.protocol_version);
  assert.equal(proxySchemaVersion, fixture.schema_version);
  const pythonFrame = new Uint8Array(Buffer.from(fixture.frame, 'base64'));
  const decoded = decodeProxyFrame(pythonFrame);
  assert.deepEqual(JSON.parse(decoder.decode(decoded.head)), fixture.wire);
  assert.deepEqual(
    decoded.parts.map((part) => Buffer.from(part).toString('base64')),
    fixture.parts,
  );
  assert.deepEqual(encodeProxyFrame(decoded.head, decoded.parts), pythonFrame);
  const padded = new Uint8Array(pythonFrame.length + 9);
  padded.set(pythonFrame, 5);
  assert.deepEqual(decodeProxyFrame(padded.subarray(5, 5 + pythonFrame.length)), decoded);
  padded.fill(0);
  assert.deepEqual(encodeProxyFrame(decoded.head, decoded.parts), pythonFrame);
});

test('framing rejects every truncated prefix, trailing bytes, and impossible part counts', () => {
  const frame = new Uint8Array(Buffer.from(fixture.frame, 'base64'));
  for (let length = 0; length < frame.length; length++)
    assert.throws(() => decodeProxyFrame(frame.subarray(0, length)), /Truncated/);
  assert.throws(() => decodeProxyFrame(new Uint8Array([...frame, 0])), /Trailing/);
  assert.throws(() => decodeProxyFrame(new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255])), /Truncated/);
  assert.deepEqual(decodeProxyFrame(encodeProxyFrame(new Uint8Array(), [])), { head: new Uint8Array(), parts: [] });
});

test('catalog calls use pinned versions, binary bodies, service credentials, and typed paths', async () => {
  const requests = [];
  const catalog = createCatalogClient({
    baseUrl: 'https://catalog.test/prefix',
    apiKey: 'secret',
    fetch: async (request) => {
      const frame = decodeProxyFrame(new Uint8Array(await request.arrayBuffer()));
      const head = JSON.parse(decoder.decode(frame.head));
      requests.push({ request, head, parts: frame.parts });
      return head.method === 'create_dir'
        ? response({ $pxt: 'Dir', v: 'directory-id' })
        : response({ parent: entry(true, { docs: entry(false, {}, 'table-id') }) });
    },
  });
  assert.equal(await catalog.createDirectory('parent/child', { parents: true, ifExists: 'ignore' }), 'directory-id');
  assert.deepEqual(requests[0].head, {
    protocol_version: 4,
    schema_version: 56,
    class_name: 'CatalogBase',
    method: 'create_dir',
    args: {
      path: { $pxt: 'Path', v: { components: ['parent', 'child'], version: null } },
      if_exists: { $pxt: 'IfExistsParam', v: 'IGNORE' },
      parents: true,
    },
  });
  assert.equal(requests[0].request.url, 'https://catalog.test/prefix/rpc');
  assert.equal(requests[0].request.headers.get('authorization'), 'Bearer secret');
  assert.equal(requests[0].request.headers.get('content-type'), 'application/octet-stream');
  assert.deepEqual(await catalog.listDirectory('', { recursive: true }), [
    {
      name: 'parent',
      isDirectory: true,
      tableId: null,
      children: [{ name: 'docs', isDirectory: false, tableId: 'table-id', children: [] }],
    },
  ]);
  assert.equal(requests[1].head.args.recursive, true);
  for (const path of ['../escape', '/root', 'a//b', 'pxt://other:db/path', 'a.b'])
    await assert.rejects(catalog.listDirectory(path), /slash-separated/);
  await assert.rejects(catalog.createDirectory(''), /required/);
  assert.equal(requests.length, 2);
});

test('catalog errors remain structured and mutations are never retried', async () => {
  let calls = 0;
  const detail = { message: 'Directory exists', error_code: 'PATH_ALREADY_EXISTS' };
  const client = createCatalogClient({
    baseUrl: 'https://catalog.test',
    fetch: async () => {
      calls++;
      return response(null, detail);
    },
  });
  await assert.rejects(
    client.createDirectory('docs'),
    (error) => error instanceof CatalogError && error.detail.error_code === detail.error_code,
  );
  assert.equal(calls, 1);
});

test('catalog rejects malformed responses and preserves abort signals', async () => {
  for (const body of [
    response({ bad: { $pxt: 'unknown', v: {} } }),
    new Response(new Uint8Array([0, 0, 0])),
    response({ bad: entry('yes') }),
  ]) {
    const client = createCatalogClient({ baseUrl: 'https://catalog.test', fetch: async () => body });
    await assert.rejects(client.listDirectory(), TypeError);
  }
  const client = createCatalogClient({
    baseUrl: 'https://catalog.test',
    fetch: async (_, options) => {
      options.signal.throwIfAborted();
      return response({});
    },
  });
  await assert.rejects(client.listDirectory('', { signal: AbortSignal.abort() }), { name: 'AbortError' });
});

const tableResponse = JSON.parse(await readFile(new URL('./fixtures/catalog-table.json', import.meta.url), 'utf8'));
const schemaDefinition = {
  id: { type: 'int', primaryKey: true },
  title: { type: 'string' },
  score: { type: 'float', nullable: true },
};

test('typed table creation, insertion, and collection follow Python metadata and query encoding', async () => {
  const requests = [];
  const metadata = structuredClone(tableResponse.result.v[0]);
  const catalog = createCatalogClient({
    baseUrl: 'https://catalog.test',
    fetch: async (request) => {
      const head = JSON.parse(decoder.decode(decodeProxyFrame(new Uint8Array(await request.arrayBuffer())).head));
      requests.push(head);
      if (head.method === 'create_table') return response(tableResponse.result);
      if (head.method === 'insert') {
        metadata[0].v.version_md.version++;
        return new Response(
          encodeProxyFrame(
            encoder.encode(
              JSON.stringify({
                result: { $pxt: 'UpdateStatus', v: { row_count_stats: { ins_rows: head.args.rows.length } } },
                error: null,
                current_md: metadata,
                is_stale_md: false,
              }),
            ),
            [],
          ),
        );
      }
      if (head.method === 'count') return response(1);
      return response({
        schema: {
          id: { $pxt: 'ColumnType', v: { _classname: 'IntType', nullable: false } },
          title: { $pxt: 'ColumnType', v: { _classname: 'StringType', nullable: false } },
          score: { $pxt: 'ColumnType', v: { _classname: 'FloatType', nullable: true } },
        },
        rows: [[1, 'hello', null]],
      });
    },
  });
  const table = await catalog.createTable('test/docs', schemaDefinition);
  assert.equal(requests[0].args.schema.id.type.v._classname, 'IntType');
  assert.equal(requests[0].args.schema.id.primary_key, true);
  assert.equal(requests[0].args.schema.score.type.v.nullable, true);
  assert.deepEqual(await table.insert([{ id: 1, title: 'hello' }]), { insertedRows: 1 });
  assert.equal(requests[1].class_name, 'Table');
  assert.equal(requests[1].snapshot_path_key.tbl_version.effective_version, 0);
  assert.deepEqual(requests[1].args.rows, [{ id: 1, title: 'hello', score: null }]);
  await table.insert([{ id: 2, title: 'two', score: 2.5 }]);
  assert.equal(requests[2].snapshot_path_key.tbl_version.effective_version, 1);
  assert.deepEqual(await table.collect({ limit: 1 }), [{ id: 1, title: 'hello', score: null }]);
  assert.deepEqual(requests[3].args.query.limit_val, {
    _classname: 'Literal',
    val: 1,
    col_type: { _classname: 'IntType', nullable: false },
  });
  assert.equal(await table.count(), 1);
  const sent = requests.length;
  for (const row of [
    { id: '1', title: 'bad' },
    { id: 1 },
    { id: 1, title: 'bad', unknown: 1 },
    { id: Number.MAX_SAFE_INTEGER + 1, title: 'bad' },
  ])
    await assert.rejects(table.insert([row]), TypeError);
  await assert.rejects(table.collect({ limit: -1 }), TypeError);
  assert.equal(requests.length, sent);
});

test('schema mismatches and stale versions fail without retrying a write', async () => {
  let requests = 0;
  const catalog = createCatalogClient({
    baseUrl: 'https://catalog.test',
    fetch: async (request) => {
      requests++;
      const head = JSON.parse(decoder.decode(decodeProxyFrame(new Uint8Array(await request.arrayBuffer())).head));
      if (head.method === 'get_table') return response(tableResponse.result.v[0]);
      return new Response(
        encodeProxyFrame(
          encoder.encode(
            JSON.stringify({ result: null, error: null, current_md: tableResponse.result.v[0], is_stale_md: true }),
          ),
          [],
        ),
      );
    },
  });
  await assert.rejects(
    catalog.openTable('test/docs', { ...schemaDefinition, title: { type: 'bool' } }),
    /Schema mismatch/,
  );
  const table = await catalog.openTable('test/docs', schemaDefinition);
  await assert.rejects(table.insert([{ id: 1, title: 'hello' }]), { name: 'CatalogStaleError' });
  assert.equal(requests, 3);
});

test('JSON cells preserve reserved keys and reject values that JSON would silently change', async () => {
  const { jsonValue, decodeJson, columnValue } = await import('../dist/catalog-schema.js');
  const input = JSON.parse('{"$pxt":"literal","__proto__":{"safe":true},"nested":[{"$pxt":"more"},false,null]}');
  const encoded = jsonValue(input, true);
  assert.equal(encoded.$pxt, 'rawdict');
  assert.deepEqual(decodeJson(encoded), input);
  assert.equal(Object.getPrototypeOf(decodeJson(encoded)), Object.prototype);
  for (const value of [undefined, new Date(), NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, { x: undefined }])
    assert.throws(() => jsonValue(value, true), TypeError);
  assert.throws(() => columnValue(null, { type: 'json' }, true), TypeError);
});
