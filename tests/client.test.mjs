import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createClient, multipartBody, PixeltableHttpError, PixeltableJobError } from '../dist/index.js';

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('JSON requests preserve service prefixes, query encoding, and headers', async (t) => {
  let received;
  const baseUrl = await serve(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received = { url: req.url, body: JSON.parse(body), headers: req.headers };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ title_upper: 'HELLO' }));
  });
  const { api } = createClient({ baseUrl: `${baseUrl}/service/`, apiKey: 'test-key', headers: { 'x-client': 'sdk' } });
  const result = await api.POST('/docs', { body: { title: 'hello' }, params: { query: { q: 'a & b' } } });
  assert.deepEqual(result.data, { title_upper: 'HELLO' });
  assert.equal(received.url, '/service/docs?q=a%20%26%20b');
  assert.deepEqual(received.body, { title: 'hello' });
  assert.equal(received.headers.authorization, 'Bearer test-key');
  assert.equal(received.headers['x-client'], 'sdk');
});

test('structured and plain HTTP errors keep status and response body without retrying', async () => {
  for (const [body, expected] of [
    [JSON.stringify({ detail: 'stale schema', error_code: 'CONFLICT' }), 'stale schema'],
    [JSON.stringify({ detail: { message: 'stale schema', error_code: 'CONFLICT', retryable: false } }), 'stale schema'],
    ['upstream failed', 'upstream failed'],
  ]) {
    let calls = 0;
    const { api } = createClient({
      baseUrl: 'http://localhost:8000',
      fetch: async () => {
        calls++;
        return new Response(body, { status: 409, headers: { 'x-request-id': 'request-1' } });
      },
    });
    await assert.rejects(api.POST('/docs', { body: {} }), (error) => {
      assert.ok(error instanceof PixeltableHttpError);
      assert.equal(error.status, 409);
      assert.equal(error.message, expected);
      assert.equal(error.errorCode, expected === 'stale schema' ? 'CONFLICT' : undefined);
      assert.equal(error.headers.get('x-request-id'), 'request-1');
      assert.ok(error.body);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('multipart serializes binary and primitive fields with a generated boundary', async () => {
  const { api } = createClient({
    baseUrl: 'http://localhost:8000',
    fetch: async (request) => {
      assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/);
      const form = await request.formData();
      assert.equal(form.get('id'), '0');
      assert.equal(form.get('enabled'), 'false');
      assert.equal(form.get('title'), '');
      assert.equal(form.has('missing'), false);
      assert.equal(await form.get('image').text(), 'binary-content');
      return Response.json({ id: 0 });
    },
  });
  await api.POST('/upload', {
    body: { id: 0, enabled: false, title: '', missing: null, image: new Blob(['binary-content']) },
    bodySerializer: multipartBody,
  });
});

test('job polling follows returned URLs and preserves null results', async () => {
  let calls = 0;
  const client = createClient({
    baseUrl: 'http://localhost:8000/service',
    apiKey: 'key',
    fetch: async (request) => {
      assert.equal(request.url, 'http://localhost:8000/service/_pxt/jobs/abc');
      assert.equal(request.headers.get('authorization'), 'Bearer key');
      return Response.json(
        ++calls === 1 ? { status: 'pending', result: null, error: null } : { status: 'done', result: null },
      );
    },
  });
  assert.equal(
    await client.job({ id: 'abc', job_url: 'http://localhost:8000/service/_pxt/jobs/abc' }).wait({ pollIntervalMs: 1 }),
    null,
  );
  assert.equal(calls, 2);
});

test('job errors and malformed status responses are surfaced', async () => {
  for (const [body, errorClass] of [
    [{ status: 'error', error: 'compute failed' }, PixeltableJobError],
    [{ status: 'done' }, TypeError],
    [{ status: 'other' }, TypeError],
  ]) {
    const client = createClient({ baseUrl: 'http://localhost:8000', fetch: async () => Response.json(body) });
    await assert.rejects(client.job({ id: 'abc', job_url: '/_pxt/jobs/abc' }).wait(), errorClass);
  }
});

test('rejects cross-service job URLs and request overrides before sending credentials', async () => {
  let calls = 0;
  const client = createClient({
    baseUrl: 'https://example.com/service',
    apiKey: 'secret',
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  for (const job_url of [
    'https://other.example/jobs/a',
    '/outside/jobs/a',
    '../jobs/a',
    'https://user:pass@example.com/service/jobs/a',
  ]) {
    assert.throws(() => client.job({ id: 'a', job_url }), TypeError);
  }
  await assert.rejects(client.api.GET('/docs', { baseUrl: 'https://other.example' }), TypeError);
  assert.equal(calls, 0);
});

test('redirects are rejected', async (t) => {
  const baseUrl = await serve(t, (_req, res) => {
    res.writeHead(302, { location: '/elsewhere' });
    res.end();
  });
  const client = createClient({ baseUrl });
  await assert.rejects(client.api.GET('/docs'), TypeError);
});

test('request timeout and caller cancellation abort pending fetches', async (t) => {
  const baseUrl = await serve(t, () => {});
  const client = createClient({ baseUrl, timeoutMs: 20 });
  await assert.rejects(client.api.GET('/docs'), { name: 'TimeoutError' });
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(client.api.GET('/docs', { signal: abort.signal }), { name: 'AbortError' });
});

test('job wait deadline covers pending HTTP requests and polling delays', async (t) => {
  const baseUrl = await serve(t, () => {});
  const client = createClient({ baseUrl, timeoutMs: 1000 });
  await assert.rejects(client.job({ id: 'a', job_url: '/_pxt/jobs/a' }).wait({ timeoutMs: 20 }), {
    name: 'TimeoutError',
  });
  const pending = createClient({ baseUrl, fetch: async () => Response.json({ status: 'pending' }) });
  await assert.rejects(
    pending.job({ id: 'a', job_url: '/_pxt/jobs/a' }).wait({ timeoutMs: 20, pollIntervalMs: 1000 }),
    { name: 'TimeoutError' },
  );
  const abort = new AbortController();
  const waiting = pending.job({ id: 'a', job_url: '/_pxt/jobs/a' }).wait({ signal: abort.signal });
  abort.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
});

test('binary and empty responses use the OpenAPI fetch response modes', async () => {
  const client = createClient({
    baseUrl: 'http://localhost:8000',
    fetch: async (req) => (req.url.endsWith('/empty') ? new Response(null, { status: 204 }) : new Response('bytes')),
  });
  assert.equal((await client.api.GET('/empty')).data, undefined);
  const { data } = await client.api.GET('/image', { parseAs: 'blob' });
  assert.equal(await data.text(), 'bytes');
});

test('invalid configuration is rejected synchronously', () => {
  for (const baseUrl of [
    'file:///tmp/test',
    'https://u:p@example.com',
    'http://localhost/?key=x',
    'http://localhost/#x',
  ]) {
    assert.throws(() => createClient({ baseUrl }), TypeError);
  }
  for (const timeoutMs of [0, -1, Infinity, 1.5]) {
    assert.throws(() => createClient({ baseUrl: 'http://localhost', timeoutMs }), RangeError);
  }
});
