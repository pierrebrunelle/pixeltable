import { createClient } from './index.js';
import type { ClientOptions } from './index.js';
import { decodeProxyFrame, encodeProxyFrame, proxyProtocolVersion, proxySchemaVersion } from './proxy-protocol.js';

interface ProxyPaths {
  '/rpc': {
    post: {
      requestBody: { content: { 'application/octet-stream': Uint8Array<ArrayBuffer> } };
      responses: { 200: { content: { 'application/octet-stream': unknown } } };
    };
  };
}

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  tableId: string | null;
  children: DirectoryEntry[];
}

export class CatalogError extends Error {
  constructor(readonly detail: Record<string, unknown>) {
    super(typeof detail.message === 'string' ? detail.message : 'Catalog operation failed');
    this.name = 'CatalogError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid catalog response');
  return value as Record<string, unknown>;
}

function tagged(value: unknown, tag: string): unknown {
  const wrapper = record(value);
  if (wrapper.$pxt !== tag || !Object.hasOwn(wrapper, 'v')) throw new TypeError(`Expected catalog ${tag}`);
  return wrapper.v;
}

function pathValue(path: string): unknown {
  const components = path === '' ? [] : path.split('/');
  if (components.some((component) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(component))) {
    throw new TypeError('Catalog paths must contain slash-separated identifiers');
  }
  return { $pxt: 'Path', v: { components, version: null } };
}

function directoryEntries(value: unknown): DirectoryEntry[] {
  return Object.entries(record(value)).map(([name, wrapped]) => {
    const entry = record(tagged(wrapped, 'DirEntry'));
    if (typeof entry.is_dir !== 'boolean') throw new TypeError('Invalid catalog directory entry');
    const tableId = entry.table === null ? null : tagged(record(entry.table).id, 'UUID');
    if (tableId !== null && typeof tableId !== 'string') throw new TypeError('Invalid catalog table ID');
    return { name, isDirectory: entry.is_dir, tableId, children: directoryEntries(entry.dir_entries) };
  });
}

export function createCatalogClient(options: ClientOptions) {
  const client = createClient<ProxyPaths>(options);
  async function call(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const head = new TextEncoder().encode(
      JSON.stringify({
        protocol_version: proxyProtocolVersion,
        schema_version: proxySchemaVersion,
        class_name: 'CatalogBase',
        method,
        args,
      }),
    );
    const { data } = await client.api.POST('/rpc', {
      body: encodeProxyFrame(head, []),
      bodySerializer: (body) => body,
      headers: { 'Content-Type': 'application/octet-stream' },
      parseAs: 'arrayBuffer',
      ...(signal ? { signal } : {}),
    });
    if (!data) throw new TypeError('Missing catalog response');
    const frame = decodeProxyFrame(new Uint8Array(data));
    if (frame.parts.length) throw new TypeError('Unexpected binary catalog result');
    const response = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame.head)));
    if (response.error !== null && response.error !== undefined) throw new CatalogError(record(response.error));
    if (!Object.hasOwn(response, 'result')) throw new TypeError('Missing catalog result');
    return response.result;
  }
  return {
    async listDirectory(
      path = '',
      options: { recursive?: boolean; signal?: AbortSignal } = {},
    ): Promise<DirectoryEntry[]> {
      return directoryEntries(
        await call(
          'get_dir_contents',
          {
            dir_path: pathValue(path),
            recursive: options.recursive ?? false,
            with_error_counts: false,
          },
          options.signal,
        ),
      );
    },
    async createDirectory(
      path: string,
      options: { ifExists?: 'error' | 'ignore'; parents?: boolean; signal?: AbortSignal } = {},
    ): Promise<string> {
      if (path === '') throw new TypeError('A directory path is required');
      const result = await call(
        'create_dir',
        {
          path: pathValue(path),
          if_exists: { $pxt: 'IfExistsParam', v: options.ifExists === 'ignore' ? 'IGNORE' : 'ERROR' },
          parents: options.parents ?? false,
        },
        options.signal,
      );
      const id = tagged(result, 'Dir');
      if (typeof id !== 'string') throw new TypeError('Invalid catalog directory ID');
      return id;
    },
  };
}
