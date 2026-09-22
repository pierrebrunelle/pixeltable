import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { encodeBinaryParts, decodeBinaryParts } from '../dist/catalog-binary.js';
import { columnValue, literalValue } from '../dist/catalog-schema.js';

test('binary values match Python tags and preserve empty values, slices, and escaped dictionaries', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/proxy.json', import.meta.url), 'utf8'));
  const parts = [];
  const bytes = new Uint8Array([7, 0, 255, 16, 8]).subarray(1, 4);
  const wire = encodeBinaryParts({ bytes, empty: new Uint8Array() }, parts);
  assert.deepEqual(wire, { bytes: fixture.wire.bytes, empty: fixture.wire.empty });
  assert.deepEqual(
    parts.map((part) => Buffer.from(part).toString('base64')),
    fixture.parts,
  );
  const result = decodeBinaryParts(wire, parts);
  assert.deepEqual(result.bytes, bytes);
  assert.deepEqual(result.empty, new Uint8Array());
  bytes.fill(9);
  assert.deepEqual(result.bytes, new Uint8Array([0, 255, 16]));
  const escaped = {
    $pxt: 'rawdict',
    v: [
      ['$pxt', 'bytes'],
      ['v', 999],
    ],
  };
  assert.deepEqual(decodeBinaryParts(escaped, []), escaped);
  assert.equal(literalValue(result.bytes, { type: 'binary' }), 'AP8Q');
  assert.throws(() => columnValue('AP8Q', { type: 'binary' }, true), /Uint8Array/);
  assert.throws(() => columnValue([0, 255], { type: 'binary' }, false), /Uint8Array/);
});

test('binary decoding rejects malformed, remote, and unused part references', () => {
  for (const index of [-1, 1, 0.5, 'remote.bin', null])
    assert.throws(() => decodeBinaryParts({ $pxt: 'bytes', v: index }, [new Uint8Array()]), /reference/);
  assert.throws(() => decodeBinaryParts({}, [new Uint8Array()]), /Unexpected binary/);
  const rows = decodeBinaryParts(
    [
      { $pxt: 'bytes', v: 0 },
      { $pxt: 'bytes', v: 0 },
    ],
    [new Uint8Array([1])],
  );
  rows[0][0] = 2;
  assert.equal(rows[1][0], 1);
});
