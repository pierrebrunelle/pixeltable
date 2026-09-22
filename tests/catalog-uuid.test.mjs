import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { catalogUuid } from '../dist/catalog.js';
import { columnValue, literalValue } from '../dist/catalog-schema.js';
import { createTableQueries } from '../dist/catalog-query.js';

test('UUID values normalize supported forms and reject malformed inputs and wire tags', () => {
  const expected = 'abcdef01-2345-6789-abcd-ef0123456789';
  for (const value of [
    expected,
    expected.toUpperCase(),
    expected.replaceAll('-', ''),
    `{${expected}}`,
    `urn:uuid:${expected}`,
  ])
    assert.equal(catalogUuid(value), expected);
  assert.equal(catalogUuid('0'.repeat(32)), '00000000-0000-0000-0000-000000000000');
  for (const value of ['', '0'.repeat(31), 'g'.repeat(32), ` ${expected}`, `${expected} `, null, 1])
    assert.throws(() => catalogUuid(value), TypeError);
  assert.deepEqual(columnValue(expected, { type: 'uuid' }, true), { $pxt: 'UUID', v: expected });
  assert.equal(columnValue({ $pxt: 'UUID', v: expected.toUpperCase() }, { type: 'uuid' }, false), expected);
  assert.equal(literalValue(expected, { type: 'uuid' }), expected);
  assert.throws(() => columnValue(expected, { type: 'uuid' }, false));
  assert.throws(() => columnValue({ $pxt: 'uuid', v: expected }, { type: 'uuid' }, false));
});

test('UUID comparison and membership serialization match Python', async () => {
  const id = '12345678-1234-5678-1234-567812345678';
  const { columns } = createTableQueries(
    id,
    { value: { type: 'uuid' } },
    { value: 0 },
    async () => [],
    async () => 0,
  );
  const value = catalogUuid('ABCDEF01-2345-6789-ABCD-EF0123456789');
  const expressions = {
    equality: columns.value.eq(value),
    ordering: columns.value.lt(value),
    membership: columns.value.isIn([value]),
  };
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-uuid.json', import.meta.url), 'utf8'));
  for (const [name, expression] of Object.entries(expressions)) assert.deepEqual(expression.toWire(id), python[name]);
  assert.throws(() => columns.value.aggregate('min'), /scalar/);
});
