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
