'use client';

import { createElement } from 'react';
import { createClient, defineQuery } from '@pixeltable/sdk';
import type { JobHandle } from '@pixeltable/sdk';
import { usePixeltableJob, usePixeltableMutation, usePixeltableQuery } from '@pixeltable/sdk/react';
import type { paths } from '../tests/fixtures/service.js';

export function createDocumentQueries(applicationUrl: string, sessionId: string) {
  const client = createClient<paths>({ baseUrl: applicationUrl });
  const lookup = defineQuery([applicationUrl, sessionId, 'lookup'], async (id: number, options) => {
    const { data } = await client.api.GET('/lookup', { params: { query: { id } }, ...options });
    if (!data) throw new Error('Expected query rows');
    return data.rows;
  });
  return {
    lookup,
    rename: async (input: { id: number; title: string }): Promise<void> => {
      await client.api.POST('/edit', { body: input });
    },
    job: client.job,
    scope: [applicationUrl, sessionId],
  };
}

export function DocumentTitle({
  id,
  queries,
  job,
}: {
  id: number;
  queries: ReturnType<typeof createDocumentQueries>;
  job: JobHandle | null;
}) {
  const rows = usePixeltableQuery(queries.lookup, id);
  const rename = usePixeltableMutation(queries.rename, { invalidate: [queries.lookup] });
  const status = usePixeltableJob(job, { scope: queries.scope, invalidate: [queries.lookup] });
  if (rows.isPending) return createElement('p', null, 'Loading');
  if (rows.error) return createElement('p', null, rows.error.message);
  return createElement(
    'section',
    null,
    createElement('p', null, rows.data[0]?.title_upper ?? 'No document'),
    createElement(
      'button',
      { disabled: rename.isPending, onClick: () => rename.mutate({ id, title: 'New title' }) },
      'Rename',
    ),
    rename.error && createElement('p', null, rename.error.message),
    status.data?.status === 'pending' && createElement('p', null, 'Processing'),
    status.data?.status === 'error' && createElement('p', null, status.data.error),
    status.error && createElement('p', null, status.error.message),
  );
}
