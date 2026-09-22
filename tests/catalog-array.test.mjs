import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { CatalogArray, catalogArray } from '../dist/catalog-array.js';
import { encodeBinaryParts, decodeBinaryParts } from '../dist/catalog-binary.js';

test('numeric typed arrays retain sliced bytes and immutable layout through ndarray transport', () => {
  const input = new BigInt64Array([9n, -(2n ** 63n), 2n ** 63n - 1n, 8n]).subarray(1, 3);
  const array = catalogArray(input, [1, 2]);
  const original = array.data;
  input.fill(0n);
  array.data.fill(0);
  assert.deepEqual(array.data, original);
  assert.throws(() => array.shape.push(3));
  assert.throws(() => {
    array.descr = '<f8';
  });
  const parts = [];
  const wire = encodeBinaryParts({ rows: [[array, new Uint8Array([1])]] }, parts);
  assert.deepEqual(wire, {
    rows: [
      [
        { $pxt: 'ndarray', v: 0 },
        { $pxt: 'bytes', v: 1 },
      ],
    ],
  });
  const decoded = decodeBinaryParts(wire, parts).rows[0][0];
  assert.ok(decoded instanceof CatalogArray);
  assert.deepEqual(decoded.shape, [1, 2]);
  assert.deepEqual(decoded.data, original);
  assert.deepEqual(decoded.toNpy(), parts[0]);
});

test('all supported typed arrays validate shape and round trip through NumPy files', () => {
  for (const Type of [
    Int8Array,
    Uint8Array,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    BigInt64Array,
    BigUint64Array,
    Float32Array,
    Float64Array,
  ]) {
    const array = catalogArray(new Type(6), [2, 3]);
    assert.deepEqual(CatalogArray.fromNpy(array.toNpy()).data, array.data);
  }
  assert.deepEqual(catalogArray(new Float32Array(), [2, 0]).shape, [2, 0]);
  assert.deepEqual(catalogArray(new Float64Array([1]), []).shape, []);
  assert.throws(() => catalogArray([1, 2]), /typed array/);
  assert.throws(() => catalogArray(new Float32Array(2), [3]), /length/);
  assert.throws(() => catalogArray(new Uint8ClampedArray(2)), /typed array/);
});

test('Python ndarray fixtures decode with dtype, memory order, and bytes intact', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/catalog-npy.json', import.meta.url), 'utf8'));
  for (const fixture of Object.values(fixtures)) {
    const array = decodeBinaryParts({ $pxt: 'ndarray', v: 0 }, [Buffer.from(fixture.npy, 'base64')]);
    assert.equal(array.descr, fixture.descr);
    assert.equal(array.fortranOrder, fixture.fortranOrder);
    assert.deepEqual(array.shape, fixture.shape);
    assert.deepEqual(array.data, new Uint8Array(Buffer.from(fixture.data, 'base64')));
  }
  assert.throws(() => decodeBinaryParts({ $pxt: 'ndarray', v: 'remote.npy' }, []), /reference/);
  assert.throws(() => decodeBinaryParts({ $pxt: 'ndarray', v: 0 }, [new Uint8Array([1])]), /magic/);
});
