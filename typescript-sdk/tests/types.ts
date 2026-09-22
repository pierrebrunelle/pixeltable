import { createCatalogClient } from '@pixeltable/sdk/experimental/catalog';
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
