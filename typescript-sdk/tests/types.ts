import { createCatalogClient, defineCatalogFunction } from '@pixeltable/sdk/experimental/catalog';
import { createServiceClient } from './fixtures/client.js';
import { createClient, defineQuery, multipartBody } from '../src/index.js';
import type { JobHandle } from '../src/index.js';
import { usePixeltableQuery, usePixeltableMutation, usePixeltableJob } from '../src/react.js';
import type { paths } from './fixtures/service.js';

const client = createClient<paths>({ baseUrl: 'http://localhost:8000' });

export async function checkTypes(): Promise<void> {
  const inserted = await client.api.POST('/docs', { body: { id: 1, title: 'hello' } });
  if (inserted.data) {
    const title: string = inserted.data.title_upper;
    const id: number = inserted.data.id;
    void [title, id];
    // @ts-expect-error The response only contains declared outputs.
    inserted.data.unknown_column;
  }
  await client.api.POST('/upload', {
    body: { id: 2, title: 'image', image: new Blob(['image']) },
    bodySerializer: multipartBody,
  });
  await client.api.GET('/lookup', { params: { query: { id: 1 } } });
  // @ts-expect-error id must be numeric.
  await client.api.POST('/docs', { body: { id: '1', title: 'hello' } });
  // @ts-expect-error title is required.
  await client.api.POST('/docs', { body: { id: 1 } });
  // @ts-expect-error This route does not exist.
  await client.api.POST('/not-a-route', { body: {} });
  // @ts-expect-error Insert routes are POST endpoints.
  await client.api.GET('/docs');
  // @ts-expect-error Query inputs are required.
  await client.api.GET('/lookup');
  // @ts-expect-error Upload inputs must be binary.
  await client.api.POST('/upload', { body: { id: 1, title: 'image', image: 'file.png' } });
}

export function checkHookTypes(job: JobHandle): void {
  const query = defineQuery(['service', 'session', 'lookup'], async (id: number) => ({ id, title: 'title' }));
  const result = usePixeltableQuery(query, 1);
  const title: string | undefined = result.data?.title;
  void title;
  // @ts-expect-error Query input types come from the handle.
  usePixeltableQuery(query, '1');
  // @ts-expect-error Query output types come from the handle.
  const invalidTitle: number | undefined = result.data?.title;
  void invalidTitle;
  const mutation = usePixeltableMutation(async (input: { id: number }) => input.id, { invalidate: [query] });
  mutation.mutate({ id: 1 });
  // @ts-expect-error Mutation inputs retain their declared type.
  mutation.mutate({ id: '1' });
  usePixeltableJob(job, { scope: ['service', 'session'] });
  // @ts-expect-error Jobs require an explicit cache scope.
  usePixeltableJob(job, {});
}

export async function checkNamedCalls(): Promise<void> {
  const service = createServiceClient({ baseUrl: 'https://service.test' });
  const inserted = await service.operations.insert_docs_docs_post({ id: 1, title: 'hello' });
  const title: string = inserted.title_upper;
  const lookup = defineQuery(['service', 'session', 'lookup'], service.operations.query_lookup_lookup_get);
  const result = await lookup.run({ id: 1 });
  const id: number | undefined = result.rows[0]?.id;
  void [title, id];
  await service.operations.insert_upload_upload_post({ id: 2, title: 'image', image: new Blob() });
  // @ts-expect-error The generated input requires title.
  await service.operations.insert_docs_docs_post({ id: 1 });
  // @ts-expect-error Query IDs are numbers.
  await service.operations.query_lookup_lookup_get({ id: '1' });
  // @ts-expect-error Upload inputs are binary.
  await service.operations.insert_upload_upload_post({ id: 2, title: 'image', image: 'file.png' });
  // @ts-expect-error Only declared outputs are available.
  inserted.title;
}

export function checkGeneratedHandles(): void {
  const service = createServiceClient({ baseUrl: 'https://service.test' });
  const queries = service.queries(['session']);
  const result = usePixeltableQuery(queries.query_search_search_post, { id: 1 });
  const title: string | undefined = result.data?.rows[0]?.title_upper;
  void title;
  const mutation = usePixeltableMutation(service.mutations.insert_docs_docs_post, {
    invalidate: [queries.query_search_search_post],
  });
  mutation.mutate({ id: 1, title: 'hello' });
  // @ts-expect-error Writes do not become query handles.
  queries.insert_docs_docs_post;
  // @ts-expect-error POST reads do not become mutations.
  service.mutations.query_search_search_post;
  // @ts-expect-error Generated query handles preserve input types.
  usePixeltableQuery(queries.query_search_search_post, { id: '1' });
}

export async function checkCatalogTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.createTable('docs', {
    id: { type: 'int', primaryKey: true },
    title: { type: 'string' },
    score: { type: 'float', nullable: true },
    active: { type: 'bool' },
    payload: { type: 'json' },
  });
  await table.insert([{ id: 1, title: 'hello', active: true, payload: { nested: [null, 1] } }]);
  const rows = await table.collect();
  const title: string | undefined = rows[0]?.title;
  const score: number | null | undefined = rows[0]?.score;
  void [title, score];
  // @ts-expect-error Insert requires non-nullable columns.
  await table.insert([{ id: 1 }]);
  // @ts-expect-error Boolean columns require booleans.
  await table.insert([{ id: 1, title: 'hello', active: 'yes', payload: {} }]);
  // @ts-expect-error Non-nullable JSON columns reject null.
  await table.insert([{ id: 1, title: 'hello', active: true, payload: null }]);
  // @ts-expect-error Creation cannot replace existing tables.
  await catalog.createTable('docs', { id: { type: 'int' } }, { ifExists: 'replace' });
}

export async function checkCatalogQueryTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.createTable('query_types', {
    id: { type: 'int' },
    title: { type: 'string' },
    score: { type: 'float', nullable: true },
    active: { type: 'bool' },
    payload: { type: 'json' },
  });
  const rows = await table
    .query()
    .where(table.columns.id.gt(1).and(table.columns.score.ne(null)))
    .select('id', 'title')
    .orderBy('id', 'desc')
    .collect();
  const title: string | undefined = rows[0]?.title;
  void title;
  // @ts-expect-error Projection removes unselected columns.
  rows[0]?.score;
  // @ts-expect-error Predicates retain the column's type.
  table.columns.id.eq('1');
  // @ts-expect-error Ordering comparisons do not accept boolean columns.
  table.columns.active.gt(true);
  // @ts-expect-error JSON columns cannot be sorted.
  table.query().orderBy('payload');
  // @ts-expect-error Selected columns must exist.
  table.query().select('missing');
  // @ts-expect-error Non-nullable fields do not accept null equality inputs.
  table.columns.title.eq(null);
}

export async function checkCatalogMutationTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('docs', {
    id: { type: 'int' },
    title: { type: 'string' },
    score: { type: 'float', nullable: true },
  });
  await table.update({ score: null }, { where: table.columns.id.eq(1) });
  await table.delete({ where: table.columns.title.eq('old') });
  // @ts-expect-error Updates retain column types.
  await table.update({ id: '1' });
  // @ts-expect-error Updates reject unknown columns.
  await table.update({ missing: true });
  // @ts-expect-error Non-nullable columns reject null.
  await table.update({ title: null });
}

export async function checkExpressionUpdates(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('docs', {
    id: { type: 'int' },
    title: { type: 'string' },
    score: { type: 'float', nullable: true },
  });
  await table.update({ score: table.columns.id.add(1).divide(2) });
  await table.update({ score: table.columns.score.multiply(2) });
  await table.update({ title: table.columns.title });
  // @ts-expect-error Nullable expressions cannot target required columns.
  await table.update({ id: table.columns.score });
  // @ts-expect-error String expressions cannot target numeric columns.
  await table.update({ score: table.columns.title });
  // @ts-expect-error Arithmetic requires a numeric column.
  table.columns.title.add(1);
  // @ts-expect-error Arithmetic literals must be numbers.
  table.columns.id.add('1');
}

export async function checkColumnOperands(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('docs', {
    id: { type: 'int' },
    score: { type: 'float', nullable: true },
    title: { type: 'string' },
  });
  await table.update({ score: table.columns.id.multiply(table.columns.score).add(1) });
  table.query().where(table.columns.id.gt(table.columns.score));
  table.query().where(table.columns.title.eq(table.columns.title));
  // @ts-expect-error Nullable right operands propagate to the result.
  await table.update({ id: table.columns.id.add(table.columns.score) });
  // @ts-expect-error Arithmetic operands must be numeric.
  table.columns.id.add(table.columns.title);
  // @ts-expect-error Comparison operands must have compatible types.
  table.columns.id.eq(table.columns.title);
}

export async function checkComputedColumns(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const source = await catalog.createTable('docs', { id: { type: 'int' }, score: { type: 'float', nullable: true } });
  const table = await source.addComputedColumn('doubled', source.columns.score.multiply(2));
  await table.insert([{ id: 1, score: 2 }]);
  const rows = await table.collect();
  const doubled: number | null | undefined = rows[0]?.doubled;
  void doubled;
  // @ts-expect-error Computed columns cannot be inserted.
  await table.insert([{ id: 1, doubled: 2 }]);
  // @ts-expect-error Computed columns cannot be updated.
  await table.update({ doubled: 2 });
  // @ts-expect-error Nullable computed results remain nullable.
  const required: number = rows[0]!.doubled;
  void required;
}

export async function checkIndexTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('docs', {
    id: { type: 'int' },
    title: { type: 'string' },
    active: { type: 'bool' },
    payload: { type: 'json' },
  });
  await table.addBtreeIndex('id', { name: 'id_idx' });
  await table.addBtreeIndex('title');
  await table.dropIndex('id_idx', { ifNotExists: 'ignore' });
  // @ts-expect-error Python excludes boolean B-tree indexes.
  await table.addBtreeIndex('active');
  // @ts-expect-error JSON does not support B-tree indexes.
  await table.addBtreeIndex('payload');
  // @ts-expect-error Indexed columns must exist.
  await table.addBtreeIndex('missing');
  // @ts-expect-error Index creation does not replace existing indexes.
  await table.addBtreeIndex('id', { ifExists: 'replace' });
}

export async function checkVersionTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const original = await catalog.createTable('history', { id: { type: 'int' } });
  const expanded = await original.addComputedColumn('next', original.columns.id.add(1));
  const reverted = await expanded.revert(original.schema);
  const version: number | undefined = (await reverted.getVersions({ limit: 1 }))[0]?.version;
  void version;
  // @ts-expect-error Reverted schema no longer exposes the computed column.
  reverted.columns.next;
  await reverted.insert([{ id: 1 }]);
}

export async function checkViewTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.createTable('base', { id: { type: 'int' }, title: { type: 'string' } });
  const view = await table.createView('filtered', { where: table.columns.id.gt(1) });
  const rows = await view.query().select('title').collect();
  const title: string | undefined = rows[0]?.title;
  void title;
  // @ts-expect-error View handles do not expose row insertion.
  await view.insert([{ id: 2, title: 'no' }]);
  // @ts-expect-error View handles do not expose base-table writes.
  await view.update({ title: 'no' });
}

export async function checkViewAuthoringTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.createTable('base', { id: { type: 'int' } });
  const view = await table.createView('filtered');
  const enriched = await view.addComputedColumn('next', view.columns.id.add(1));
  await enriched.addBtreeIndex('next');
  const nested = await enriched.createView('nested', { where: enriched.columns.next.gt(5) });
  const value: number | undefined = (await nested.collect())[0]?.next;
  void value;
  // @ts-expect-error Adding computed columns must not expose base-row insertion.
  await enriched.insert([{ id: 1 }]);
}

export async function checkSchemaMutationTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const base = await catalog.createTable('evolving', { id: { type: 'int' } });
  const added = await base.addColumn('note', { type: 'string', nullable: true });
  await added.insert([{ id: 1, note: 'hello' }]);
  const renamed = await added.renameColumn('note', 'text');
  await renamed.update({ text: null });
  // @ts-expect-error The old column name is removed.
  await renamed.update({ note: 'old' });
  const dropped = await renamed.dropColumn('text');
  // @ts-expect-error Dropped columns are removed from inputs.
  await dropped.insert([{ id: 2, text: 'old' }]);
  // @ts-expect-error Column names must exist.
  await dropped.dropColumn('missing');
  const derived = await dropped.addComputedColumn('double_id', dropped.columns.id.multiply(2));
  const renamedComputed = await derived.renameColumn('double_id', 'twice');
  // @ts-expect-error Renaming preserves computed write protection.
  await renamedComputed.update({ twice: 4 });
}

export async function checkProjectionTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('base', { id: { type: 'int' }, score: { type: 'float', nullable: true } });
  const rows = await table
    .query()
    .selectExpressions({
      item: table.columns.id,
      total: table.columns.score.multiply(2),
    })
    .where(table.columns.id.gt(0))
    .orderBy('id')
    .limit(5)
    .collect();
  const item: number = rows[0]!.item;
  const total: number | null = rows[0]!.total;
  void item;
  void total;
  // @ts-expect-error Projections preserve nullable outputs.
  const required: number = rows[0]!.total;
  void required;
  // @ts-expect-error Original names are replaced by aliases.
  rows[0]!.score;
  // @ts-expect-error Projection values must be catalog expressions.
  table.query().selectExpressions({ total: 2 });
}

export async function checkFunctionTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.createTable('base', { title: { type: 'string' }, id: { type: 'int' } });
  const upper = defineCatalogFunction(
    'pixeltable.functions.string.upper',
    { self: { type: 'string' } },
    { type: 'string' },
  );
  const result = table.callFunction(upper, { self: table.columns.title });
  const rows = await table.query().selectExpressions({ uppercase: result }).collect();
  const text: string = rows[0]!.uppercase;
  void text;
  // @ts-expect-error Function parameters retain their declared type.
  table.callFunction(upper, { self: table.columns.id });
  // @ts-expect-error Function parameters are required.
  table.callFunction(upper, {});
  // @ts-expect-error Function parameters must match declared names.
  table.callFunction(upper, { wrong: 'hello' });
}

export async function checkTextSearchTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.createTable('search', {
    title: { type: 'string' },
    id: { type: 'int' },
    payload: { type: 'json' },
  });
  await table.addEmbeddingIndex('title', { embedding: 'app.embed' });
  const score = table.columns.title.similarity('query');
  const rows = await table.query().selectExpressions({ score }).orderBy(score, 'desc').collect();
  const value: number = rows[0]!.score;
  void value;
  // @ts-expect-error Text indexes require string columns.
  await table.addEmbeddingIndex('id', { embedding: 'app.embed' });
  // @ts-expect-error Similarity requires a string column.
  table.columns.id.similarity('query');
  // @ts-expect-error Similarity requires a string query.
  table.columns.title.similarity(1);
  // @ts-expect-error JSON expressions cannot be sorted.
  table.query().orderBy(table.columns.payload);
}

export async function checkErrorPropertyTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('errors', { result: { type: 'int', computed: true } });
  const rows = await table.query().selectExpressions({ message: table.columns.result.errorMessage }).collect();
  const message: string | null = rows[0]!.message;
  void message;
  // @ts-expect-error Error properties are nullable even when the computed column is required.
  const required: string = rows[0]!.message;
  void required;
}

export async function checkRecomputeTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('retry', { value: { type: 'int' }, result: { type: 'int', computed: true } });
  const status = await table.recomputeColumns(['result'], { errorsOnly: true });
  const errors: number = status.errors;
  void errors;
  // @ts-expect-error Base columns cannot be recomputed.
  await table.recomputeColumns(['value']);
  // @ts-expect-error Unknown columns cannot be recomputed.
  await table.recomputeColumns(['missing']);
}

export async function checkInsertErrorPolicy(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('docs', { text: { type: 'string' } });
  const status = await table.insert([{ text: 'hello' }], { onError: 'ignore' });
  const errors: number = status.errors;
  void errors;
  // @ts-expect-error Unknown error policies are rejected.
  await table.insert([{ text: 'hello' }], { onError: 'skip' });
}

export async function checkSnapshotTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('source', { id: { type: 'int' } });
  const snapshot = await table.createSnapshot('frozen');
  const rows = await snapshot.query().select('id').collect();
  const id: number = rows[0]!.id;
  void id;
  // @ts-expect-error Snapshots are read-only.
  await snapshot.insert([{ id: 2 }]);
  // @ts-expect-error Snapshot values cannot be recomputed.
  await snapshot.recomputeColumns([]);
  // @ts-expect-error Snapshot schemas cannot be modified.
  await snapshot.addColumn('other', { type: 'int' });
}

export async function checkMembershipTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('membership', {
    id: { type: 'int' },
    choices: { type: 'json' },
    score: { type: 'float', nullable: true },
  });
  table.query().where(table.columns.id.isIn([1, 2]));
  table.query().where(table.columns.id.isIn(table.columns.choices));
  table.query().where(table.columns.score.isIn([1, null]));
  // @ts-expect-error Membership lists must match the column type.
  table.columns.id.isIn(['1']);
  // @ts-expect-error Required columns do not accept null list members.
  table.columns.id.isIn([null]);
  // @ts-expect-error Membership requires a scalar left-hand expression.
  table.columns.choices.isIn([1]);
}

export async function checkBackfillErrorPolicy(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('docs', { value: { type: 'int' } });
  const computed = await table.addComputedColumn('double', table.columns.value.multiply(2), { onError: 'ignore' });
  const errors = computed.columns.double.errorType;
  void errors;
  // @ts-expect-error Unknown backfill error policies are rejected.
  await table.addComputedColumn('double', table.columns.value.multiply(2), { onError: 'skip' });
}

export async function checkComputeTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('pipeline', {
    input: { type: 'string' },
    result: { type: 'int', computed: true },
  });
  const rows = await table.compute([{ input: '1' }], { onError: 'ignore' });
  const result: number | null = rows[0]!.values.result;
  void result;
  // @ts-expect-error Failed computations can return null even for required columns.
  const required: number = rows[0]!.values.result;
  void required;
  // @ts-expect-error Computed columns are not inputs.
  await table.compute([{ input: '1', result: 1 }]);
}

export async function checkBatchUpdateTypes(): Promise<void> {
  const catalog = createCatalogClient({ baseUrl: 'https://catalog.test' });
  const table = await catalog.openTable('items', {
    tenant: { type: 'string', primaryKey: true },
    id: { type: 'int', primaryKey: true },
    text: { type: 'string' },
    derived: { type: 'int', computed: true },
  });
  await table.batchUpdate([{ tenant: 'a', id: 1, text: 'changed' }]);
  // @ts-expect-error All components of a composite primary key are required.
  await table.batchUpdate([{ id: 1, text: 'changed' }]);
  // @ts-expect-error Computed values cannot be updated.
  await table.batchUpdate([{ tenant: 'a', id: 1, derived: 2 }]);
  const unkeyed = await catalog.openTable('unkeyed', { id: { type: 'int' } });
  // @ts-expect-error Batch updates require declared primary keys.
  await unkeyed.batchUpdate([{ id: 1 }]);
}
