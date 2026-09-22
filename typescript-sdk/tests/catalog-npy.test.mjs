import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { decodeNpy, encodeNpy } from '../dist/catalog-npy.js';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/catalog-npy.json', import.meta.url), 'utf8'));
test('NumPy versions 1–3 preserve numeric dtype, layout, shape, and exact payload bytes', () => {
  for (const fixture of Object.values(fixtures)) {
    const expected = {
      descr: fixture.descr,
      shape: fixture.shape,
      fortranOrder: fixture.fortranOrder,
      data: new Uint8Array(Buffer.from(fixture.data, 'base64')),
    };
    const decoded = decodeNpy(Buffer.from(fixture.npy, 'base64'));
    assert.deepEqual(decoded, expected);
    assert.deepEqual(decodeNpy(encodeNpy(decoded)), expected);
  }
});

test('NumPy decoding rejects malformed headers, unsafe shapes, and mismatched payloads', () => {
  const valid = encodeNpy({ descr: '<f4', shape: [1], fortranOrder: false, data: new Uint8Array(4) });
  for (const size of [0, 6, 9, valid.length - 1]) assert.throws(() => decodeNpy(valid.slice(0, size)));
  assert.throws(() => decodeNpy(new Uint8Array([...valid, 0])), /length/);
  const version = valid.slice();
  version[6] = 4;
  assert.throws(() => decodeNpy(version), /version/);
  for (const descr of ['|O8', '<c8', '<U4', '|i4', '<f1'])
    assert.throws(() => encodeNpy({ descr, shape: [1], fortranOrder: false, data: new Uint8Array(4) }));
  for (const shape of [[-1], [1.5], [Number.MAX_SAFE_INTEGER, 2]])
    assert.throws(() => encodeNpy({ descr: '<i4', shape, fortranOrder: false, data: new Uint8Array() }));
  const text = new TextDecoder().decode(valid.slice(10, 128));
  for (const header of [
    text.replace("'descr'", "'other'"),
    text.replace('(1,)', '(1 )'),
    text.replace("'<f4'", "'|O4'"),
    text.replace('False', 'eval()'),
  ]) {
    const altered = new Uint8Array(10 + header.length + 4);
    altered.set(valid.slice(0, 10));
    new DataView(altered.buffer).setUint16(8, header.length, true);
    altered.set(new TextEncoder().encode(header), 10);
    assert.throws(() => decodeNpy(altered));
  }
});
