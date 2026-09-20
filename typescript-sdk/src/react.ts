'use client';

import { useEffect, useRef } from 'react';
import { hashKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { QueryHandle, QueryReference } from './handles.js';
import type { JobHandle, JobStatus } from './index.js';

export interface QueryOptions {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
}

export interface MutationOptions {
  invalidate?: readonly QueryReference[];
}

export interface JobOptions extends MutationOptions {
  scope: readonly unknown[];
  enabled?: boolean;
  pollIntervalMs?: number;
}

function queryPrefix(query: QueryReference): readonly unknown[] {
  return ['pixeltable', 'query', hashKey(query.key)];
}

export function usePixeltableQuery<Input, Output>(
  query: QueryHandle<Input, Output>,
  input: NoInfer<Input>,
  options: QueryOptions = {},
): UseQueryResult<Output, Error> {
  return useQuery({
    ...options,
    queryKey: [...queryPrefix(query), input],
    queryFn: ({ signal }) => query.run(input, { signal }),
    retry: false,
  });
}

export function usePixeltableMutation<Input, Output>(
  mutation: (input: Input) => Promise<Output>,
  options: MutationOptions = {},
): UseMutationResult<Output, Error, Input> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: mutation,
    retry: false,
    onSuccess: async () => {
      await Promise.all(
        (options.invalidate ?? []).map((query) => client.invalidateQueries({ queryKey: queryPrefix(query) })),
      );
    },
  });
}

export function usePixeltableJob(job: JobHandle | null, options: JobOptions): UseQueryResult<JobStatus, Error> {
  const client = useQueryClient();
  const completedKey = useRef<string | null>(null);
  const pollInterval = options.pollIntervalMs ?? 1000;
  if (!Number.isInteger(pollInterval) || pollInterval < 1 || pollInterval > 2_147_483_647) {
    throw new RangeError('pollIntervalMs must be an integer between 1 and 2147483647');
  }
  if (options.scope.length === 0) throw new TypeError('A job scope must identify the service and session');
  const queryKey = ['pixeltable', 'job', ...options.scope, job?.id ?? null];
  const cacheKey = hashKey(queryKey);
  const result = useQuery<JobStatus, Error>({
    queryKey,
    queryFn: ({ signal }) => {
      if (!job) throw new TypeError('No job was supplied');
      return job.status({ signal });
    },
    enabled: job !== null && (options.enabled ?? true),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const status = query.state.data?.status;
      return status === undefined || status === 'pending' ? pollInterval : false;
    },
  });
  useEffect(() => {
    if (result.data?.status !== 'done' || completedKey.current === cacheKey) return;
    completedKey.current = cacheKey;
    for (const query of options.invalidate ?? []) {
      void client.invalidateQueries({ queryKey: queryPrefix(query) });
    }
  }, [result.data?.status, cacheKey, client, options.invalidate]);
  return result;
}
