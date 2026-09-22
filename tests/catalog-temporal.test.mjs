import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { catalogDate, catalogTimestamp } from '../dist/catalog.js';
import { columnValue } from '../dist/catalog-schema.js';
import { createTableQueries } from '../dist/catalog-query.js';

test('temporal values validate calendars and preserve timestamp microseconds', () => {
  assert.equal(catalogDate('2000-02-29'), '2000-02-29');
  assert.equal(catalogDate('0001-01-01'), '0001-01-01');
  for (const value of ['1900-02-29', '2026-02-30', '0000-01-01', '2026-13-01', '2026-01-00', '2026-1-1', new Date()])
    assert.throws(() => catalogDate(value), TypeError);
  const at = catalogTimestamp('2026-09-22T05:30:01.123456-07:00');
  assert.equal(at, '2026-09-22T12:30:01.123456+00:00');
  assert.equal(catalogTimestamp('2026-01-01T00:00:00.1+01:00'), '2025-12-31T23:00:00.100000+00:00');
  assert.equal(catalogTimestamp('0001-01-01T00:00:00Z'), '0001-01-01T00:00:00+00:00');
  assert.equal(catalogTimestamp('2026-01-01T00:00:00.000000Z'), '2026-01-01T00:00:00+00:00');
  for (const value of [
    '2026-02-30T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00',
    '2026-01-01T00:00:00.1234567Z',
    '2026-01-01T00:00:00+24:00',
    '2026-01-01T00:00:00+00:60',
    '0001-01-01T00:00:00+01:00',
    '9999-12-31T23:00:00-02:00',
  ])
    assert.throws(() => catalogTimestamp(value));
  assert.deepEqual(columnValue(at, { type: 'timestamp' }, true), { $pxt: 'datetime', v: at });
  assert.equal(columnValue({ $pxt: 'datetime', v: at }, { type: 'timestamp' }, false), at);
  assert.throws(() => columnValue({ $pxt: 'date', v: '2026-01-01' }, { type: 'timestamp' }, false), TypeError);
  assert.throws(() => columnValue(at, { type: 'timestamp' }, false), TypeError);
});

test('temporal comparisons and membership match Python wire values', async () => {
  const id = '12345678-1234-5678-1234-567812345678';
  const { columns } = createTableQueries(
    id,
    { day: { type: 'date' }, at: { type: 'timestamp' } },
    { day: 0, at: 1 },
    async () => [],
    async () => 0,
  );
  const day = catalogDate('2026-09-22');
  const at = catalogTimestamp('2026-09-22T12:30:01.123456Z');
  const expressions = {
    date_compare: columns.day.gte(day),
    timestamp_compare: columns.at.lt(at),
    date_membership: columns.day.isIn([day]),
    timestamp_membership: columns.at.isIn([at]),
  };
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-temporal.json', import.meta.url), 'utf8'));
  for (const [name, expr] of Object.entries(expressions)) assert.deepEqual(expr.toWire(id), python[name]);
  assert.throws(() => columns.day.aggregate('min'), /scalar/);
});
