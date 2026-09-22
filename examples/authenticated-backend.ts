import { createClient, multipartBody, PixeltableHttpError } from '@pixeltable/sdk/server';
import type { BackgroundJob, ClientOptions } from '@pixeltable/sdk/server';
import type { paths } from '../tests/fixtures/service.js';

export interface Session {
  tenantId: string;
}

export interface JobStore {
  get(tenantId: string, jobId: string): Promise<BackgroundJob | undefined>;
  put(tenantId: string, ticket: BackgroundJob): Promise<void>;
}

export interface BackendOptions {
  applicationUrl: string;
  authenticate(request: Request): Promise<Session | null>;
  services: ReadonlyMap<string, ClientOptions>;
  jobs: JobStore;
}

class InvalidInput extends Error {}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new InvalidInput();
  return value;
}

function title(value: unknown): string {
  if (typeof value !== 'string') throw new InvalidInput();
  return value;
}

function reply(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
}

export function createDocumentBackend(options: BackendOptions): (request: Request) => Promise<Response> {
  const application = new URL(options.applicationUrl);
  const prefix = application.pathname.replace(/\/$/, '');
  const services = new Map([...options.services].map(([tenant, config]) => [tenant, createClient<paths>(config)]));
  const routes = new Map([
    ['/lookup', 'GET'],
    ['/search', 'POST'],
    ['/docs', 'POST'],
    ['/edit', 'POST'],
    ['/remove', 'POST'],
    ['/preview', 'POST'],
    ['/upload', 'POST'],
    ['/background', 'POST'],
  ]);

  return async (request) => {
    try {
      const url = new URL(request.url);
      if (url.origin !== application.origin || !url.pathname.startsWith(`${prefix}/`))
        return reply({ error: 'Not found' }, 404);
      const path = url.pathname.slice(prefix.length);
      const jobMatch = /^\/jobs\/([a-zA-Z0-9_-]+)$/.exec(path);
      const method = jobMatch ? 'GET' : routes.get(path);
      if (!method) return reply({ error: 'Not found' }, 404);
      if (request.method !== method) return reply({ error: 'Method not allowed' }, 405);
      if (request.method === 'POST' && request.headers.get('origin') !== application.origin) {
        return reply({ error: 'Invalid origin' }, 403);
      }
      const session = await options.authenticate(request);
      if (!session) return reply({ error: 'Authentication required' }, 401);
      const client = services.get(session.tenantId);
      if (!client) return reply({ error: 'Tenant access denied' }, 403);
      const signal = request.signal;
      if (jobMatch) {
        const ticket = await options.jobs.get(session.tenantId, jobMatch[1]!);
        if (!ticket) return reply({ error: 'Not found' }, 404);
        const status = await client.job(ticket).status({ signal });
        return reply(status.status === 'error' ? { status: 'error', error: 'Computation failed' } : status);
      }
      if (path === '/lookup') {
        const rawId = url.searchParams.get('id');
        if (rawId === null || !/^-?\d+$/.test(rawId)) throw new InvalidInput();
        const result = await client.api.GET('/lookup', { params: { query: { id: integer(Number(rawId)) } }, signal });
        return reply(result.data);
      }
      if (path === '/upload') {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          throw new InvalidInput();
        }
        const rawId = form.get('id');
        if (typeof rawId !== 'string' || !/^-?\d+$/.test(rawId)) throw new InvalidInput();
        const image = form.get('image');
        if (image !== null && !(image instanceof Blob)) throw new InvalidInput();
        const body = { id: integer(Number(rawId)), title: title(form.get('title')), ...(image ? { image } : {}) };
        const result = await client.api.POST('/upload', { body, bodySerializer: multipartBody, signal });
        return reply(result.data);
      }
      const input: unknown = await request.json();
      if (typeof input !== 'object' || input === null || !('id' in input)) throw new InvalidInput();
      const id = integer(input.id);
      if (path === '/search' || path === '/remove') {
        const result = await client.api.POST(path, { body: { id }, signal });
        return reply(result.data);
      }
      if (!('title' in input)) throw new InvalidInput();
      const body = { id, title: title(input.title) };
      if (path === '/background') {
        const { data: ticket } = await client.api.POST('/background', { body, signal });
        if (!ticket || !/^[a-zA-Z0-9_-]+$/.test(ticket.id)) throw new Error('Invalid job ticket');
        client.job(ticket);
        await options.jobs.put(session.tenantId, ticket);
        return reply({ id: ticket.id, job_url: `${prefix}/jobs/${ticket.id}` });
      }
      if (path === '/docs' || path === '/edit' || path === '/preview') {
        const result = await client.api.POST(path, { body, signal });
        return reply(result.data);
      }
      return reply({ error: 'Not found' }, 404);
    } catch (error) {
      if (request.signal.aborted) throw error;
      if (error instanceof InvalidInput || error instanceof SyntaxError) return reply({ error: 'Invalid input' }, 400);
      if (error instanceof PixeltableHttpError && [400, 404, 409, 422].includes(error.status)) {
        return reply({ error: 'Service rejected the request' }, error.status);
      }
      return reply({ error: 'Service unavailable' }, 502);
    }
  };
}
