import { createClient } from './index.js';
import type { ClientOptions } from './index.js';
import { decodeProxyFrame, encodeProxyFrame, proxyProtocolVersion, proxySchemaVersion } from './proxy-protocol.js';

import { columnClasses, columnValue, copySchema } from './catalog-schema.js';
import type { CatalogSchema, CatalogInsertRow, CatalogRow } from './catalog-schema.js';
export type { CatalogColumn, CatalogSchema, CatalogRow, CatalogInsertRow, JsonValue } from './catalog-schema.js';

export class CatalogStaleError extends Error {
  constructor() {
    super('Catalog version changed; reopen the table before retrying');
    this.name = 'CatalogStaleError';
  }
}

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
  async function rpc(
    method: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    context: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const head = new TextEncoder().encode(
      JSON.stringify({
        protocol_version: proxyProtocolVersion,
        schema_version: proxySchemaVersion,
        class_name: 'CatalogBase',
        method,
        args,
        ...context,
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
    if (response.is_stale_md === true) throw new CatalogStaleError();
    if (!Object.hasOwn(response, 'result')) throw new TypeError('Missing catalog result');
    return response;
  }
  async function call(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    return (await rpc(method, args, signal)).result;
  }
  function tableHandle<S extends CatalogSchema>(path: string, schema: S, metadata: unknown) {
    function readMetadata(value: unknown): { id: string; version: number } {
      if (!Array.isArray(value) || value.length !== 1) throw new TypeError('Expected base-table metadata');
      const md = record(tagged(value[0], 'TableVersionMd'));
      const table = record(md.tbl_md);
      if (table.view_md !== null || typeof table.tbl_id !== 'string') throw new TypeError('Expected a base table');
      const version = record(md.version_md).version;
      if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0)
        throw new TypeError('Invalid table version');
      const columns = Object.values(record(record(md.schema_version_md).columns))
        .map(record)
        .filter((column) => column.name !== null);
      if (columns.length !== Object.keys(schema).length)
        throw new TypeError('Table schema differs from the supplied schema');
      for (const column of columns) {
        const name = column.name;
        if (typeof name !== 'string' || !Object.hasOwn(schema, name))
          throw new TypeError('Table columns differ from the supplied schema');
        const expected = schema[name]!;
        const type = record(column.col_type);
        if (
          Object.keys(type).some((key) => !['_classname', 'nullable'].includes(key)) ||
          column.value_expr !== null ||
          type._classname !== columnClasses[expected.type] ||
          type.nullable !== (expected.nullable ?? false) ||
          column.is_pk !== (expected.primaryKey ?? false)
        )
          throw new TypeError(`Schema mismatch for column ${name}`);
      }
      return { id: table.tbl_id, version };
    }
    let state = readMetadata(metadata);
    const id = state.id;
    const pathKey = { tbl_version: { id, effective_version: null }, base: null };
    function query(limit: number | null) {
      return {
        _classname: 'Query',
        from_clause: { tbls: [pathKey], join_clauses: [] },
        select_list: null,
        where_clause: null,
        group_by_clause: null,
        grouping_tbl: null,
        order_by_clause: null,
        limit_val:
          limit === null
            ? null
            : { _classname: 'Literal', val: limit, col_type: { _classname: 'IntType', nullable: false } },
        offset_val: null,
        sample_clause: null,
      };
    }
    return {
      id,
      path,
      schema,
      async insert(
        rows: readonly CatalogInsertRow<S>[],
        options: { signal?: AbortSignal } = {},
      ): Promise<{ insertedRows: number }> {
        const wireRows = rows.map((row) => {
          const values = record(row);
          if (Object.keys(values).some((name) => !Object.hasOwn(schema, name)))
            throw new TypeError('Unknown insert column');
          return Object.fromEntries(
            Object.entries(schema).map(([name, column]) => [
              name,
              columnValue(
                Object.hasOwn(values, name) ? values[name] : column.nullable ? null : undefined,
                column,
                true,
              ),
            ]),
          );
        });
        const response = await rpc(
          'insert',
          { rows: wireRows, on_error: 'abort', print_stats: false, return_rows: false },
          options.signal,
          {
            class_name: 'Table',
            path_key: pathKey,
            snapshot_path_key: { tbl_version: { id, effective_version: state.version }, base: null },
          },
        );
        const updated = readMetadata(response.current_md);
        if (updated.id !== id) throw new TypeError('Table identity changed');
        state = updated;
        const status = record(tagged(response.result, 'UpdateStatus'));
        const insertedRows = record(status.row_count_stats).ins_rows;
        if (typeof insertedRows !== 'number' || !Number.isSafeInteger(insertedRows) || insertedRows < 0)
          throw new TypeError('Invalid insert count');
        return { insertedRows };
      },
      async collect(options: { limit?: number; signal?: AbortSignal } = {}): Promise<CatalogRow<S>[]> {
        const limit = options.limit ?? null;
        if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0))
          throw new TypeError('limit must be a nonnegative safe integer');
        const response = await rpc('collect', { query: query(limit) }, options.signal, { class_name: 'Query' });
        const result = record(response.result);
        const columns = Object.entries(record(result.schema));
        if (columns.length !== Object.keys(schema).length) throw new TypeError('Query schema changed');
        for (const [name, wrapped] of columns) {
          const column = schema[name];
          const type = record(tagged(wrapped, 'ColumnType'));
          if (!column || type._classname !== columnClasses[column.type] || type.nullable !== (column.nullable ?? false))
            throw new TypeError('Query schema changed');
        }
        if (!Array.isArray(result.rows)) throw new TypeError('Invalid query rows');
        return result.rows.map((row: unknown) => {
          if (!Array.isArray(row) || row.length !== columns.length) throw new TypeError('Invalid query row');
          return Object.fromEntries(
            columns.map(([name], index) => [name, columnValue(row[index], schema[name]!, false)]),
          ) as CatalogRow<S>;
        });
      },
      async count(options: { signal?: AbortSignal } = {}): Promise<number> {
        const { result } = await rpc('count', { query: query(null) }, options.signal, { class_name: 'Query' });
        if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0)
          throw new TypeError('Invalid row count');
        return result;
      },
    };
  }
  return {
    async createTable<const S extends CatalogSchema>(
      path: string,
      definition: S,
      options: { ifExists?: 'error' | 'ignore'; signal?: AbortSignal } = {},
    ) {
      if (!path) throw new TypeError('A table path is required');
      const schema = copySchema(definition);
      const result = tagged(
        await call(
          'create_table',
          {
            path: pathValue(path),
            schema: Object.fromEntries(
              Object.entries(schema).map(([name, column]) => [
                name,
                {
                  type: {
                    $pxt: 'ColumnType',
                    v: { _classname: columnClasses[column.type], nullable: column.nullable ?? false },
                  },
                  primary_key: column.primaryKey ?? false,
                },
              ]),
            ),
            if_exists: { $pxt: 'IfExistsParam', v: options.ifExists === 'ignore' ? 'IGNORE' : 'ERROR' },
            comment: null,
            custom_metadata: null,
            media_validation: { $pxt: 'MediaValidation', v: 'ON_WRITE' },
            has_default_idxs: false,
            is_data_versioned: true,
          },
          options.signal,
        ),
        'tuple',
      );
      if (!Array.isArray(result) || result.length !== 2 || typeof result[1] !== 'boolean')
        throw new TypeError('Invalid create-table response');
      return tableHandle(path, schema, result[0]);
    },
    async openTable<const S extends CatalogSchema>(
      path: string,
      definition: S,
      options: { signal?: AbortSignal } = {},
    ) {
      const schema = copySchema(definition);
      const result = await call(
        'get_table',
        { path: pathValue(path), if_not_exists: { $pxt: 'IfNotExistsParam', v: 'ERROR' } },
        options.signal,
      );
      return tableHandle(path, schema, result);
    },
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
