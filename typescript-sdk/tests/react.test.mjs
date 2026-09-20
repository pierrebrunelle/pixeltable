import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element']) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(() => dom.window.close());
const { createElement } = await import('react');
const { renderHook, act, cleanup, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { defineQuery } = await import('../dist/index.js');
const { usePixeltableQuery, usePixeltableMutation, usePixeltableJob } = await import('../dist/react.js');

function context(t) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity, retry: 3 } },
  });
  t.after(() => {
    cleanup();
    client.clear();
  });
  return { client, wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children) };
}

test('React query shares cached results for equivalent inputs', async (t) => {
  const { wrapper } = context(t);
  let calls = 0;
  const query = defineQuery(['service', 'session', 'lookup'], async (input) => {
    calls++;
    return { title: input.title.toUpperCase() };
  });
  const first = renderHook(() => usePixeltableQuery(query, { title: 'hello' }, { staleTime: Infinity }), { wrapper });
  await waitFor(() => assert.equal(first.result.current.data?.title, 'HELLO'));
  const second = renderHook(() => usePixeltableQuery(query, { title: 'hello' }, { staleTime: Infinity }), { wrapper });
  assert.equal(second.result.current.data.title, 'HELLO');
  assert.equal(calls, 1);
});

test('React query cancels obsolete inputs and prevents stale results replacing new data', async (t) => {
  const { wrapper } = context(t);
  let resolveFirst;
  let firstSignal;
  const query = defineQuery(['service', 'session', 'lookup'], async (input, { signal }) => {
    if (input === 'first') {
      firstSignal = signal;
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    }
    return input;
  });
  const hook = renderHook(({ input }) => usePixeltableQuery(query, input), {
    wrapper,
    initialProps: { input: 'first' },
  });
  await waitFor(() => assert.ok(firstSignal));
  hook.rerender({ input: 'second' });
  await waitFor(() => assert.equal(hook.result.current.data, 'second'));
  assert.equal(firstSignal.aborted, true);
  await act(async () => {
    resolveFirst('first');
    await delay(10);
  });
  assert.equal(hook.result.current.data, 'second');
});

test('successful mutations invalidate every input of selected queries only', async (t) => {
  const { wrapper } = context(t);
  let version = 0;
  let otherCalls = 0;
  const query = defineQuery(['service', 'session', 'lookup'], async (id) => ({ id, version }));
  const other = defineQuery(['service', 'session', 'lookup', 'other-query'], async () => {
    otherCalls++;
    return 'private';
  });
  const hook = renderHook(
    () => ({
      first: usePixeltableQuery(query, 1, { staleTime: Infinity }),
      second: usePixeltableQuery(query, 2, { staleTime: Infinity }),
      other: usePixeltableQuery(other, null, { staleTime: Infinity }),
      mutation: usePixeltableMutation(
        async () => {
          version++;
          return version;
        },
        { invalidate: [query] },
      ),
    }),
    { wrapper },
  );
  await waitFor(() => assert.equal(hook.result.current.second.data?.version, 0));
  await act(async () => {
    assert.equal(await hook.result.current.mutation.mutateAsync(), 1);
  });
  await waitFor(() => assert.equal(hook.result.current.first.data?.version, 1));
  assert.equal(hook.result.current.second.data.version, 1);
  assert.equal(otherCalls, 1);
});

test('failed mutations are not retried or used to invalidate successful reads', async (t) => {
  const { wrapper } = context(t);
  let reads = 0;
  let writes = 0;
  const query = defineQuery(['service', 'session', 'lookup'], async () => {
    reads++;
    return 'value';
  });
  const failure = new Error('write failed');
  const hook = renderHook(
    () => ({
      query: usePixeltableQuery(query, null, { staleTime: Infinity }),
      mutation: usePixeltableMutation(
        async () => {
          writes++;
          throw failure;
        },
        { invalidate: [query] },
      ),
    }),
    { wrapper },
  );
  await waitFor(() => assert.equal(hook.result.current.query.data, 'value'));
  await act(async () => {
    await assert.rejects(hook.result.current.mutation.mutateAsync(), failure);
  });
  assert.equal(writes, 1);
  assert.equal(reads, 1);
});

test('job completion stops polling and invalidates subscribed queries once', async (t) => {
  const { wrapper } = context(t);
  let polls = 0;
  let reads = 0;
  const query = defineQuery(['service', 'session', 'lookup'], async () => ++reads);
  const job = {
    id: 'job1',
    status: async () => (++polls === 1 ? { status: 'pending' } : { status: 'done', result: null }),
  };
  const hook = renderHook(
    () => ({
      query: usePixeltableQuery(query, null, { staleTime: Infinity }),
      job: usePixeltableJob(job, { scope: ['service', 'session'], pollIntervalMs: 10, invalidate: [query] }),
    }),
    { wrapper },
  );
  await waitFor(() => assert.equal(hook.result.current.job.data?.status, 'done'));
  await waitFor(() => assert.equal(hook.result.current.query.data, 2));
  hook.rerender();
  await act(async () => {
    await delay(60);
  });
  assert.equal(polls, 2);
  assert.equal(reads, 2);
});

test('failed jobs and failed polling requests stop polling', async (t) => {
  const { wrapper } = context(t);
  for (const httpFailure of [false, true]) {
    let polls = 0;
    const job = {
      id: String(httpFailure),
      status: async () => {
        polls++;
        if (httpFailure) throw new Error('expired job');
        return { status: 'error', error: 'computation failed' };
      },
    };
    const hook = renderHook(() => usePixeltableJob(job, { scope: ['service', 'session'], pollIntervalMs: 10 }), {
      wrapper,
    });
    await waitFor(() =>
      assert.ok(httpFailure ? hook.result.current.isError : hook.result.current.data?.status === 'error'),
    );
    await act(async () => {
      await delay(60);
    });
    assert.equal(polls, 1);
    hook.unmount();
  }
});

test('jobs with the same id in different scopes do not share results', async (t) => {
  const { wrapper } = context(t);
  const job = (result) => ({ id: 'same-id', status: async () => ({ status: 'done', result }) });
  const hook = renderHook(
    () => ({
      first: usePixeltableJob(job('a'), { scope: ['service', 'session-a'] }),
      second: usePixeltableJob(job('b'), { scope: ['service', 'session-b'] }),
    }),
    { wrapper },
  );
  await waitFor(() => assert.equal(hook.result.current.first.data?.result, 'a'));
  assert.equal(hook.result.current.second.data?.result, 'b');
});

test('a missing job stays idle until a ticket is available', async (t) => {
  const { wrapper } = context(t);
  const hook = renderHook(({ job }) => usePixeltableJob(job, { scope: ['service', 'session'] }), {
    wrapper,
    initialProps: { job: null },
  });
  assert.equal(hook.result.current.fetchStatus, 'idle');
  hook.rerender({ job: { id: 'available', status: async () => ({ status: 'done', result: 'ok' }) } });
  await waitFor(() => assert.equal(hook.result.current.data?.result, 'ok'));
});

test('disabled reads stay idle and unmounting cancels the active query', async (t) => {
  const { wrapper } = context(t);
  let calls = 0;
  let signal;
  const query = defineQuery(['service', 'session', 'lookup'], async (_input, options) => {
    calls++;
    signal = options.signal;
    return new Promise(() => {});
  });
  const hook = renderHook(({ enabled }) => usePixeltableQuery(query, null, { enabled }), {
    wrapper,
    initialProps: { enabled: false },
  });
  assert.equal(hook.result.current.fetchStatus, 'idle');
  assert.equal(calls, 0);
  hook.rerender({ enabled: true });
  await waitFor(() => assert.equal(calls, 1));
  hook.unmount();
  assert.equal(signal.aborted, true);
});
