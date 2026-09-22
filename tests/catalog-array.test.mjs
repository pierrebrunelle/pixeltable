import { createTableQueries } from '../dist/catalog-query.js';
import { copySchema, columnValue, columnWire, matchesColumn } from '../dist/catalog-schema.js';
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

test('array schemas preserve dtype and shape and validate metadata and cell values', () => {
  const shape = [null, 2];
  const column = copySchema({ array: { type: 'array', dtype: 'float32', shape } }).array;
  shape[1] = 7;
  const wire = { _classname: 'ArrayType', nullable: false, numpy_dtype: 'float32', shape: [null, 2] };
  assert.deepEqual(columnWire(column), wire);
  assert.equal(matchesColumn(wire, column), true);
  assert.equal(matchesColumn({ ...wire, shape: [2] }, column), false);
  assert.equal(matchesColumn({ ...wire, numpy_dtype: 'float64' }, column), false);
  assert.equal(matchesColumn({ ...wire, extra: true }, column), false);
  const array = catalogArray(new Float32Array(6), [3, 2]);
  assert.equal(columnValue(array, column, true), array);
  assert.deepEqual(columnValue(array.toNpy(), column, false).data, array.data);
  assert.throws(() => columnValue(catalogArray(new Float32Array(3)), column, true), /shape/);
  for (const invalid of [
    { type: 'array', shape: [2] },
    { type: 'array', dtype: 'float32', shape: [-1] },
    { type: 'array', dtype: 'object' },
    { type: 'array', primaryKey: true },
    { type: 'int', dtype: 'int64' },
  ])
    assert.throws(() => copySchema({ value: invalid }));
});

test('typed reads convert byte and memory order and preserve integer precision', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/catalog-npy.json', import.meta.url), 'utf8'));
  for (const [name, fixture] of Object.entries(fixtures)) {
    const array = CatalogArray.fromNpy(Buffer.from(fixture.npy, 'base64'));
    const typed = array.toTypedArray();
    const expected = fixture.flat.map((value) => (value === 'True' ? '1' : value === 'False' ? '0' : value));
    const actual = Array.from(typed, String);
    // Python float strings retain .0; compare numeric floats separately from exact integers.
    if (fixture.descr.includes('f')) assert.deepEqual(Array.from(typed), expected.map(Number), name);
    else assert.deepEqual(actual, expected, name);
    const original = array.data;
    typed.fill(typeof typed[0] === 'bigint' ? 0n : 0);
    assert.deepEqual(array.data, original);
  }
});

test('half precision typed reads handle signed zero, subnormals, infinities and NaN', () => {
  const bytes = new Uint8Array(14);
  const view = new DataView(bytes.buffer);
  [0, 0x8000, 1, 0x7bff, 0x7c00, 0xfc00, 0x7e01].forEach((value, index) => view.setUint16(index * 2, value, false));
  const array = new CatalogArray({ descr: '>f2', shape: [7], fortranOrder: false, data: bytes });
  const values = array.toTypedArray();
  assert.ok(values instanceof Float32Array);
  assert.deepEqual(Array.from(values), [0, -0, 2 ** -24, 65504, Infinity, -Infinity, NaN]);
  assert.deepEqual(array.data, bytes);
});

test('array slice expressions and inferred shapes match Python', async () => {
  const id = '12345678-1234-5678-1234-567812345678';
  const { columns } = createTableQueries(
    id,
    { value: { type: 'array', dtype: 'float32', shape: [3, 4] } },
    { value: 0 },
    async () => [],
    async () => 0,
  );
  const cases = {
    reverse: columns.value.arraySlice({ step: -1 }, { start: 1, step: 2 }),
    empty: columns.value.arraySlice({ start: 2, stop: 1 }),
    clamped: columns.value.arraySlice({ start: -100, stop: 100, step: 2 }, { step: -1 }),
    negative_stop: columns.value.arraySlice({ stop: -1, step: -1 }),
  };
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-array-slice.json', import.meta.url), 'utf8'));
  for (const [name, expression] of Object.entries(cases)) {
    const definition = expression.computedDefinition(id);
    assert.deepEqual(definition.wire.v, python[name].expression);
    assert.deepEqual(columnWire(definition.column), python[name].type);
  }
  for (const args of [[], [1], [{ step: 0 }], [{ start: 0.5 }], [{ unknown: 1 }], [{}, {}, {}]])
    assert.throws(() => columns.value.arraySlice(...args));
});
