import createOpenApiClient from 'openapi-fetch';
import type { Client } from 'openapi-fetch';

export interface ClientOptions {
  baseUrl: string;
  apiKey?: string;
  headers?: HeadersInit;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export class PixeltableHttpError extends Error {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
  readonly errorCode: string | undefined;

  constructor(response: Response, body: unknown) {
    const detail = isRecord(body) ? body.detail : body;
    const message = isRecord(detail) ? detail.message : detail;
    super(typeof message === 'string' && message ? message : `HTTP ${response.status}`);
    this.name = 'PixeltableHttpError';
    this.status = response.status;
    this.headers = new Headers(response.headers);
    this.body = body;
    const errorCode = isRecord(detail) ? detail.error_code : isRecord(body) ? body.error_code : undefined;
    this.errorCode = typeof errorCode === 'string' ? errorCode : undefined;
  }
}

export class PixeltableJobError extends Error {
  constructor(
    readonly jobId: string,
    message: string,
  ) {
    super(message);
    this.name = 'PixeltableJobError';
  }
}

export interface BackgroundJob {
  id: string;
  job_url: string;
}

export type JobStatus =
  { status: 'pending' } | { status: 'done'; result: unknown } | { status: 'error'; error: string };

export interface WaitOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface JobHandle {
  readonly id: string;
  status(options?: { signal?: AbortSignal }): Promise<JobStatus>;
  wait(options?: WaitOptions): Promise<unknown>;
}

export interface PixeltableClient<Paths extends {}> {
  api: Client<Paths>;
  job(ticket: BackgroundJob): JobHandle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function duration(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new RangeError(`${name} must be an integer between 1 and 2147483647`);
  }
  return value;
}

function parseJobStatus(value: unknown): JobStatus {
  if (isRecord(value)) {
    if (value.status === 'pending') return { status: 'pending' };
    if (value.status === 'done' && 'result' in value) return { status: 'done', result: value.result };
    if (value.status === 'error' && typeof value.error === 'string') {
      return { status: 'error', error: value.error };
    }
  }
  throw new TypeError('Invalid Pixeltable job status response');
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createClient<Paths extends {}>(options: ClientOptions): PixeltableClient<Paths> {
  const baseUrl = new URL(options.baseUrl);
  if (
    !['http:', 'https:'].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new TypeError('baseUrl must be an HTTP(S) URL without credentials, a query, or a fragment');
  }
  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, '') + '/';
  const timeoutMs = duration(options.timeoutMs ?? 30_000, 'timeoutMs');
  const headers = new Headers(options.headers);
  if (options.apiKey !== undefined) headers.set('Authorization', `Bearer ${options.apiKey}`);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  function checkUrl(url: URL): void {
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname) || url.username || url.password) {
      throw new TypeError('Request URL must stay within the configured service');
    }
  }

  const serviceFetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    checkUrl(new URL(request.url));
    const response = await fetchImpl(request, {
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
    });
    if (!response.ok) {
      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* Preserve non-JSON error responses. */
      }
      throw new PixeltableHttpError(response, body);
    }
    return response;
  };

  const api = createOpenApiClient<Paths>({
    baseUrl: baseUrl.href.replace(/\/$/, ''),
    headers,
    fetch: serviceFetch,
  });

  return {
    api,
    job(ticket): JobHandle {
      if (typeof ticket.id !== 'string' || !ticket.id || typeof ticket.job_url !== 'string' || !ticket.job_url) {
        throw new TypeError('Expected a Pixeltable background job ticket');
      }
      const id = ticket.id;
      const url = new URL(ticket.job_url, baseUrl);
      checkUrl(url);
      const status = async (requestOptions: { signal?: AbortSignal } = {}): Promise<JobStatus> => {
        const response = await serviceFetch(url, {
          headers,
          ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
        });
        return parseJobStatus(await response.json());
      };
      return {
        id,
        status,
        async wait(waitOptions = {}): Promise<unknown> {
          const pollInterval = duration(waitOptions.pollIntervalMs ?? 1000, 'pollIntervalMs');
          const deadline = new AbortController();
          const timer = setTimeout(
            () => deadline.abort(new DOMException('Job wait timed out', 'TimeoutError')),
            duration(waitOptions.timeoutMs ?? 300_000, 'timeoutMs'),
          );
          const signal = waitOptions.signal ? AbortSignal.any([deadline.signal, waitOptions.signal]) : deadline.signal;
          try {
            while (true) {
              signal.throwIfAborted();
              const current = await status({ signal });
              if (current.status === 'done') return current.result;
              if (current.status === 'error') throw new PixeltableJobError(id, current.error);
              await delay(pollInterval, signal);
            }
          } finally {
            clearTimeout(timer);
          }
        },
      };
    },
  };
}

export function multipartBody(fields: Record<string, string | number | boolean | Blob | null | undefined>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(name, value instanceof Blob ? value : String(value));
  }
  return form;
}

export { defineQuery } from './handles.js';
export type { QueryHandle, QueryReference } from './handles.js';
