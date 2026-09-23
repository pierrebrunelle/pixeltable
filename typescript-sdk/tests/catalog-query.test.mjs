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

test('sample queries match Python serialization and reject invalid combinations', async () => {
  const { columns, query, calls } = setup();
  await query().select('id').where(columns.id.gt(0)).sample({ n: 2, seed: 7 }).collect();
  await query()
    .select('id', 'title')
    .sample({ nPerStratum: 1, seed: -4, stratifyBy: ['title'] })
    .collect();
  await query().select('id').sample({ fraction: 0.5, seed: 9, stratifyBy: columns.title }).collect();
  await query().sample({ n: 1 }).select('id').collect();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-sample.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    calls.slice(0, 3).map(({ wire }) => wire),
    [python.count, python.stratified, python.fraction],
  );
  assert.deepEqual(calls[3].wire.sample_clause.n, 1);
  for (const options of [
    {},
    { n: 1, fraction: 0.5 },
    { n: 0 },
    { fraction: -1 },
    { n: 2, seed: 1.5 },
    { nPerStratum: 1 },
  ])
    assert.throws(() => query().sample(options));
  assert.throws(() => query().sample({ n: 1, stratifyBy: columns.payload }), /scalar/);
  assert.throws(() => query().sample({ n: 1, stratifyBy: setup('other').columns.id }), /belong/);
  assert.throws(() => query().sample({ n: 1 }).sample({ n: 1 }), /Multiple/);
  assert.throws(() => query().orderBy('id').sample({ n: 1 }), /cannot be used/);
  assert.throws(() => query().limit(1).sample({ n: 1 }), /cannot be used/);
  assert.throws(() => query().groupBy('id').sample({ n: 1 }), /cannot be used/);
  assert.throws(() => query().sample({ n: 1 }).where(columns.id.gt(0)), /after sample/);
  assert.throws(() => query().sample({ n: 1 }).orderBy('id'), /with sample/);
  assert.throws(() => query().sample({ n: 1 }).limit(1), /with sample/);
  assert.throws(() => query().sample({ n: 1 }).distinct(), /with sample/);
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
  assert.throws(() => table.columns.flag.gt(true), /Ordering comparisons require/);
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

test('arithmetic expressions match Python and enforce assignment types and table identity', async () => {
  const { columns } = setup();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-arithmetic.json', import.meta.url), 'utf8'));
  for (const operation of Object.keys(python)) {
    assert.deepEqual(columns.id[operation](2).toUpdateWire(tableId, { type: 'float' }).v, python[operation]);
  }
  assert.throws(() => columns.id.divide(2).toUpdateWire(tableId, { type: 'int' }), /expression type/);
  assert.throws(() => columns.score.toUpdateWire(tableId, { type: 'float' }), /expression type/);
  assert.throws(() => columns.id.add(1).toUpdateWire('different-table', { type: 'int' }), /updated table/);
  assert.throws(() => columns.title.add(2), /numeric/);
  assert.throws(() => columns.id.add(NaN), /Invalid float/);
  assert.throws(() => columns.id.add(Number.MAX_SAFE_INTEGER + 1), /Unsafe/);
});

test('column operands match Python, propagate nullable types, and reject unrelated tables', async () => {
  const { columns } = setup();
  const python = JSON.parse(
    await readFile(new URL('./fixtures/catalog-column-expressions.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    columns.id.multiply(columns.score).toUpdateWire(tableId, { type: 'float', nullable: true }).v,
    python.multiply,
  );
  assert.deepEqual(columns.id.pow(columns.id).toUpdateWire(tableId, { type: 'float' }).v, python.power);
  assert.deepEqual(columns.id.gt(columns.score).toWire(tableId), python.compare);
  assert.throws(() => columns.id.multiply(columns.score).toUpdateWire(tableId, { type: 'float' }), /expression type/);
  assert.throws(() => columns.id.pow(columns.id).toUpdateWire(tableId, { type: 'int' }), /expression type/);
  assert.throws(() => columns.id.add(columns.title), /numeric operands/);
  assert.throws(() => columns.id.eq(columns.title), /types must match/);
  const other = setup('other').columns.id;
  assert.throws(() => columns.id.add(other), /same table/);
  assert.throws(() => columns.id.eq(other), /same table/);
});

test('computed definitions retain expression types without primary-key flags', () => {
  const { columns } = setup();
  assert.deepEqual(columns.id.computedDefinition(tableId).column, { type: 'int', nullable: false, computed: true });
  assert.deepEqual(columns.score.multiply(2).computedDefinition(tableId).column, {
    type: 'float',
    nullable: true,
    computed: true,
  });
  assert.equal(columns.title.computedDefinition(tableId).wire.$pxt, 'Expr');
  assert.throws(() => columns.id.computedDefinition('other'), /belong to the table/);
});

test('view queries preserve the logical view and physical base-column identities', async () => {
  const viewId = '23456789-2345-6789-2345-678923456789';
  const pathKey = {
    tbl_version: { id: viewId, effective_version: null },
    base: { tbl_version: { id: tableId, effective_version: null }, base: null },
  };
  let actual;
  const view = createTableQueries(
    viewId,
    {
      id: schema.id,
      title: schema.title,
      score: schema.score,
    },
    {
      id: { id: 0, tableId },
      title: { id: 1, tableId },
      score: { id: 2, tableId },
    },
    async (wire) => {
      actual = wire;
      return [];
    },
    async () => 0,
    pathKey,
  );
  await view.query().select('id', 'title', 'score').collect();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-view-query.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, python);
});

test('named expression projections match Python and retain immutable query branches', async () => {
  const { columns, query, calls } = setup();
  const base = query();
  const projection = base.selectExpressions({ item: columns.id, new_score: columns.score.multiply(2) });
  await projection.collect();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-projection.json', import.meta.url), 'utf8'));
  assert.deepEqual(calls[0].wire, python);
  assert.deepEqual(calls[0].selected, ['item', 'new_score']);
  await base.collect();
  assert.equal(calls[1].selected.length, 5);
  assert.throws(() => base.selectExpressions({}), /at least one/);
  assert.throws(() => base.selectExpressions({ invalid: 1 }), /catalog expression/);
  assert.throws(() => base.selectExpressions({ 'invalid-name': columns.id }), /Column names/);
  assert.throws(() => base.selectExpressions({ foreign: setup('other').columns.id }), /belong to the table/);
});

test('registered scalar function calls match Python and validate arguments locally', async () => {
  const { defineCatalogFunction, callCatalogFunction } = await import('../dist/catalog-query.js');
  const { columns } = setup();
  const decorate = defineCatalogFunction(
    'udf_fixture.decorate',
    {
      text: { type: 'string' },
      prefix: { type: 'string' },
    },
    { type: 'string' },
  );
  const expression = callCatalogFunction(tableId, decorate, { text: columns.title, prefix: 'Hi ' });
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-function.json', import.meta.url), 'utf8'));
  assert.deepEqual(expression.computedDefinition(tableId).wire.v, python);
  assert.throws(() => callCatalogFunction(tableId, decorate, { text: columns.title }), /match the declared/);
  assert.throws(() => callCatalogFunction(tableId, decorate, { text: columns.id, prefix: 'Hi ' }), /expression type/);
  assert.throws(
    () => callCatalogFunction(tableId, decorate, { text: setup('other').columns.title, prefix: 'Hi ' }),
    /belong/,
  );
  assert.throws(() => defineCatalogFunction('invalid', { value: { type: 'int' } }, { type: 'int' }), /import path/);
});

test('text similarity ranking matches Python serialization', async () => {
  const { columns, query, calls } = setup();
  const similarity = columns.title.similarity('aaa', 'text_idx');
  await query()
    .selectExpressions({ title: columns.title, score: similarity })
    .orderBy(similarity, 'desc')
    .limit(2)
    .collect();
  const expected = JSON.parse(await readFile(new URL('fixtures/catalog-similarity.json', import.meta.url), 'utf8'));
  assert.deepEqual(calls[0].wire, expected);
  assert.throws(() => columns.id.similarity('a'), TypeError);
  assert.throws(() => columns.title.similarity(1), TypeError);
  assert.throws(() => columns.title.similarity('a', ''), TypeError);
  assert.throws(() => query().orderBy(setup('other').columns.title.similarity('a')), TypeError);
  assert.throws(() => query().orderBy(columns.payload), TypeError);
});

test('computed error properties match Python and reject non-column expressions', async () => {
  let actual;
  const { columns, query } = createTableQueries(
    tableId,
    { double_id: { type: 'int', computed: true } },
    { double_id: 5 },
    async (wire) => {
      actual = wire;
      return [];
    },
    async () => 0,
  );
  await query()
    .selectExpressions({ error_type: columns.double_id.errorType, error_message: columns.double_id.errorMessage })
    .collect();
  const expected = JSON.parse(await readFile(new URL('fixtures/catalog-errors.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, expected);
  assert.throws(() => setup().columns.id.errorType, /stored computed/);
  assert.throws(() => columns.double_id.multiply(2).errorMessage, /stored computed/);
  assert.throws(() => setup('other').query().where(columns.double_id.errorType.ne(null)), /queried table/);
});

test('snapshot queries preserve frozen logical and physical versions', async () => {
  const snapshotId = '34567890-3456-7890-3456-789034567890';
  let actual;
  const snapshot = createTableQueries(
    snapshotId,
    { id: { type: 'int' } },
    { id: { id: 0, tableId } },
    async (wire) => {
      actual = wire;
      return [];
    },
    async () => 0,
    {
      tbl_version: { id: snapshotId, effective_version: 0 },
      base: { tbl_version: { id: tableId, effective_version: 2 }, base: null },
    },
  );
  await snapshot.query().select('id').collect();
  const expected = JSON.parse(await readFile(new URL('fixtures/catalog-snapshot.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, expected);
});

test('membership predicates match Python and validate list values and table ownership', async () => {
  const { columns } = setup();
  const expected = JSON.parse(await readFile(new URL('fixtures/catalog-membership.json', import.meta.url), 'utf8'));
  assert.deepEqual(columns.id.isIn([1, 2]).toWire(tableId), expected.integers);
  assert.deepEqual(columns.title.isIn([]).toWire(tableId), expected.empty);
  assert.deepEqual(columns.score.isIn([1.5, null]).toWire(tableId), expected.nullable);
  assert.equal(columns.id.isIn(columns.payload).toWire(tableId).value_list, null);
  assert.throws(() => columns.id.isIn(['1']), TypeError);
  assert.throws(() => columns.id.isIn([null]), TypeError);
  assert.throws(() => columns.id.isIn([Infinity]), TypeError);
  assert.throws(() => columns.id.isIn('1'), TypeError);
  assert.throws(() => columns.id.isIn(new Array(1)), TypeError);
  assert.throws(() => columns.payload.isIn([{}]), TypeError);
  assert.throws(() => columns.id.isIn(columns.title), TypeError);
  assert.throws(() => columns.id.isIn(setup('other').columns.payload), TypeError);
});

test('JSON paths and casts match Python and validate path elements', async () => {
  const { columns } = createTableQueries(
    tableId,
    { payload: { type: 'json' }, required: { type: 'int' } },
    { payload: 0, required: 1 },
    async () => [],
    async () => 0,
  );
  const expressions = {
    nested: columns.payload.jsonPath('items', 0, 'name'),
    wildcard: columns.payload.jsonPath('items').jsonPath('*', 'name'),
    slice: columns.payload.jsonPath('items', { step: -1 }, 'name'),
    cast: columns.payload.jsonPath('score').asType({ type: 'float', nullable: true }),
    required_cast: columns.required.asType({ type: 'float', nullable: true }),
  };
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-json-path.json', import.meta.url), 'utf8'));
  for (const [name, expression] of Object.entries(expressions))
    assert.deepEqual(expression.computedDefinition(tableId).wire.v, python[name]);
  for (const element of [
    new Date(),
    1.2,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    null,
    [],
    { step: 0 },
    { stop: 1.5 },
    { typo: 1 },
  ])
    assert.throws(() => columns.payload.jsonPath(element), TypeError);
  assert.throws(() => columns.payload.jsonPath(), TypeError);
  assert.throws(() => columns.required.jsonPath('key'), TypeError);
  assert.throws(() => columns.payload.asType({ type: 'int', computed: true }), TypeError);
  assert.throws(() => expressions.nested.computedDefinition('another-table'), TypeError);
});

test('grouped aggregate queries match Python and preserve immutable query branches', async () => {
  const { columns, query, calls } = setup();
  const base = query();
  const grouped = base.groupBy('title');
  await grouped
    .selectExpressions({
      title: columns.title,
      total: columns.score.aggregate('sum'),
      average: columns.score.aggregate('mean'),
      minimum: columns.score.aggregate('min'),
      maximum: columns.score.aggregate('max'),
      present: columns.score.aggregate('count'),
    })
    .orderBy('title')
    .collect();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-aggregate.json', import.meta.url), 'utf8'));
  assert.deepEqual(calls[0].wire, python);
  await base.collect();
  assert.equal(calls[1].wire.group_by_clause, null);
  await grouped.where(columns.id.gt(0)).select('title').limit(2).offset(1).collect();
  assert.deepEqual(calls[2].wire.group_by_clause, python.group_by_clause);
  assert.throws(() => grouped.groupBy('id'), /already specified/);
  assert.throws(() => base.groupBy('unknown'), /Unknown/);
  assert.throws(() => base.groupBy(setup('other').columns.id), /belong/);
  assert.throws(() => columns.title.aggregate('sum'), /numeric/);
  assert.throws(() => columns.payload.aggregate('max'), /scalar/);
  assert.throws(() => columns.id.aggregate('median'), /Unsupported/);
});

test('aggregate windows match Python partition and ordering serialization', async () => {
  const { columns, query, calls } = setup();
  await query()
    .selectExpressions({
      id: columns.id,
      running: columns.score.aggregate('sum', { partitionBy: columns.title, orderBy: columns.id }),
      seen: columns.score.aggregate('count', { orderBy: columns.id }),
      minimum: columns.score.aggregate('min', { partitionBy: columns.title }),
      maximum: columns.score.aggregate('max', { partitionBy: columns.title, orderBy: columns.id }),
    })
    .collect();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-window.json', import.meta.url), 'utf8'));
  assert.deepEqual(calls[0].wire, python);
  assert.throws(() => columns.score.aggregate('mean', { orderBy: columns.id }), /not supported/);
  assert.throws(() => columns.score.aggregate('sum', {}), /requires/);
  assert.throws(() => columns.score.aggregate('sum', { orderBy: 'id' }), /expressions/);
  assert.throws(() => columns.score.aggregate('sum', { orderBy: setup('other').columns.id }), /belong/);
  assert.throws(() => columns.score.aggregate('sum', { orderBy: columns.id, descending: true }), /requires/);
});

test('distinct matches Python selected-expression grouping and preserves query branches', async () => {
  const { columns, query, calls } = setup();
  const base = query()
    .where(columns.id.gt(0))
    .selectExpressions({ title: columns.title, adjusted: columns.score.add(1) });
  const unique = base.distinct();
  await unique.collect();
  const python = JSON.parse(await readFile(new URL('./fixtures/catalog-distinct.json', import.meta.url), 'utf8'));
  assert.deepEqual(calls[0].wire, python);
  await base.collect();
  assert.equal(calls[1].wire.group_by_clause, null);
  await query().distinct().collect();
  assert.equal(calls[2].wire.group_by_clause.length, Object.keys(schema).length);
  await unique.orderBy('title').limit(1).offset(1).collect();
  assert.deepEqual(calls[3].wire.group_by_clause, python.group_by_clause);
  assert.throws(() => unique.distinct(), /already specified/);
  assert.throws(() => unique.groupBy('title'), /already specified/);
  assert.throws(() => query().groupBy('title').distinct(), /already specified/);
});
