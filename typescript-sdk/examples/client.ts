import { createClient, multipartBody } from '@pixeltable/sdk/server';
import type { paths } from '../tests/fixtures/service.js';

export async function runExample(baseUrl: string, image: Blob): Promise<unknown> {
  const client = createClient<paths>({ baseUrl });
  const { data: inserted } = await client.api.POST('/docs', {
    body: { id: 101, title: 'TypeScript meets Pixeltable' },
  });
  console.log(inserted?.title_upper);

  await client.api.POST('/upload', {
    body: { id: 102, title: 'Uploaded image', image },
    bodySerializer: multipartBody,
  });

  const { data: ticket } = await client.api.POST('/background', { body: { id: 103, title: 'Background compute' } });
  if (!ticket) throw new Error('The service returned no job ticket');
  return client.job(ticket).wait({ timeoutMs: 60_000 });
}
