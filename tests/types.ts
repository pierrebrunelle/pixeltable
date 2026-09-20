import { createClient, multipartBody } from '../src/index.js';
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
