import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createTableQueries } from '../dist/catalog-query.js';

const schema = {
  id: { type: 'int' },
  title: { type: 'string' },
  score: { type: 'float', nullable: true },
  flag: { type: 'bool' },
  payload: { type: 'json' },
};
const columnIds = { id: 0, title: 1, score: 2, flag: 3, payload: 4 };
const tableId = '12345678-1234-5678-1234-567812345678';
function setup(id = tableId) {
  const calls = [];
  const table = createTableQueries(
    id,
    schema,
    columnIds,
    async (wire, selected, signal) => {
      calls.push({ wire, selected, signal });
      return [];
    },
    async (wire, signal) => {
      calls.push({ wire, signal });
      return 0;
    },
  );
  return { ...table, calls };
}

test('query expressions match Python serialization for filter, projection, sort, limit, and offset', async () => {
  const { columns, query, calls } = setup();
  await query()
    .where(columns.id.gt(1).and(columns.score.isNull().or(columns.title.ne('skip'))))
    .select('id', 'title')
    .orderBy('id', 'desc')
    .limit(2)
    .offset(1)
    .collect();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-query.json', import.meta.url), 'utf8'));
  assert.deepEqual(calls[0].wire, python);
  assert.deepEqual(calls[0].selected, ['id', 'title']);
});

test('query branches preserve their source and repeated filters combine', async () => {
  const { columns, query, calls } = setup();
  const base = query().where(columns.id.gt(0));
  const selected = base.select('title').where(columns.score.gte(1.5)).orderBy('score', 'desc').orderBy('id');
  const signal = new AbortController().signal;
  await selected.limit(4).collect({ signal });
  await base.collect();
  assert.equal(calls[0].signal, signal);
  assert.equal(calls[0].wire.where_clause._classname, 'CompoundPredicate');
  assert.equal(calls[0].wire.order_by_clause.length, 2);
  assert.equal(calls[1].wire.order_by_clause, null);
  assert.equal(calls[1].wire.limit_val, null);
  assert.equal(calls[1].wire.select_list.length, 5);
  assert.equal(calls[1].wire.where_clause._classname, 'Comparison');
});

test('predicates reject mismatched tables and invalid operations before transport', () => {
  const table = setup();
  const other = setup('other-table');
  assert.throws(() => table.query().where(other.columns.id.eq(1)), /queried table/);
  assert.throws(() => table.columns.id.eq(1).and(other.columns.id.eq(1)), /queried table/);
  assert.throws(() => table.query().select('missing'), /Unknown query column/);
  assert.throws(() => table.query().select('id', 'id'), /distinct/);
  assert.throws(() => table.query().select(), /distinct/);
  assert.throws(() => table.query().limit(-1), /nonnegative/);
  assert.throws(() => table.query().offset(1.5), /nonnegative/);
  assert.throws(() => table.query().orderBy('payload'), /cannot be sorted/);
  assert.throws(() => table.columns.flag.gt(true), /require numeric or string/);
  assert.throws(() => table.columns.id.eq('wrong'), /Invalid float/);
  assert.equal(table.calls.length, 0);
});

test('null comparisons and numeric literals preserve Python semantics', async () => {
  const { query, columns, calls } = setup();
  await query().where(columns.score.eq(null)).count();
  await query().where(columns.score.ne(null)).count();
  await query().where(columns.id.lt(2.5)).count();
  assert.equal(calls[0].wire.where_clause._classname, 'IsNull');
  assert.equal(calls[1].wire.where_clause.operator, 2);
  assert.equal(calls[1].wire.where_clause.components[0]._classname, 'IsNull');
  assert.equal(calls[2].wire.where_clause.components[1].col_type._classname, 'FloatType');
});

test('count rejects pagination before transport', async () => {
  const { query, calls } = setup();
  await assert.rejects(query().limit(0).count(), /count\(\) cannot be used/);
  await assert.rejects(query().offset(0).count(), /count\(\) cannot be used/);
  assert.equal(calls.length, 0);
});
