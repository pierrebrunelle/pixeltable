import { createClient } from './index.js';
import type { ClientOptions } from './index.js';
import { decodeProxyFrame, encodeProxyFrame, proxyProtocolVersion, proxySchemaVersion } from './proxy-protocol.js';

import type {
  CatalogPredicate,
  CatalogUpdateRow,
  CatalogExpression,
  ComputedSchema,
  CatalogColumns,
  CatalogQuery,
} from './catalog-query.js';
import { createTableQueries, updateValue } from './catalog-query.js';
export type {
  CatalogQuery,
  CatalogColumns,
  CatalogPredicate,
  CatalogUpdateRow,
  CatalogExpression,
} from './catalog-query.js';
import { columnClasses, columnValue, copySchema } from './catalog-schema.js';
import type { CatalogSchema, CatalogInsertRow, CatalogRow } from './catalog-schema.js';
export type { CatalogColumn, CatalogSchema, CatalogRow, CatalogInsertRow, JsonValue } from './catalog-schema.js';

export type BtreeColumn<S extends CatalogSchema> = {
  [K in keyof S & string]: S[K]['type'] extends 'int' | 'float' | 'string' ? K : never;
}[keyof S & string];

export interface CatalogTable<S extends CatalogSchema> {
  readonly id: string;
  readonly path: string;
  readonly schema: S;
  readonly columns: CatalogColumns<S>;
  query(): CatalogQuery<S>;
  insert(rows: readonly CatalogInsertRow<S>[], options?: { signal?: AbortSignal }): Promise<{ insertedRows: number }>;
  update(
    values: CatalogUpdateRow<S>,
    options?: { where?: CatalogPredicate; signal?: AbortSignal },
  ): Promise<{ updatedRows: number }>;
  delete(options?: { where?: CatalogPredicate; signal?: AbortSignal }): Promise<{ deletedRows: number }>;
  collect(options?: { limit?: number; signal?: AbortSignal }): Promise<CatalogRow<S>[]>;
  count(options?: { signal?: AbortSignal }): Promise<number>;
  addBtreeIndex(
    column: BtreeColumn<S>,
    options?: { name?: string; ifExists?: 'error' | 'ignore'; signal?: AbortSignal },
  ): Promise<void>;
  dropIndex(name: string, options?: { ifNotExists?: 'error' | 'ignore'; signal?: AbortSignal }): Promise<void>;
  addComputedColumn<const N extends string, T>(
    name: N,
    expression: CatalogExpression<T>,
    options?: { signal?: AbortSignal },
  ): Promise<CatalogTable<S & ComputedSchema<N, T>>>;
}

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
  function tableHandle<S extends CatalogSchema>(path: string, schema: S, metadata: unknown): CatalogTable<S> {
    function readMetadata(value: unknown): { id: string; version: number; columnIds: Record<string, number> } {
      if (!Array.isArray(value) || value.length !== 1) throw new TypeError('Expected base-table metadata');
      const md = record(tagged(value[0], 'TableVersionMd'));
      const table = record(md.tbl_md);
      if (table.view_md !== null || typeof table.tbl_id !== 'string') throw new TypeError('Expected a base table');
      const version = record(md.version_md).version;
      if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0)
        throw new TypeError('Invalid table version');
      const columnIds: Record<string, number> = {};
      for (const [id, value] of Object.entries(record(record(md.schema_version_md).columns))) {
        const name = record(value).name;
        if (typeof name === 'string') {
          if (!Number.isSafeInteger(Number(id)) || Number(id) < 0) throw new TypeError('Invalid column ID');
          columnIds[name] = Number(id);
        }
      }
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
          (column.value_expr !== null) !== (expected.computed ?? false) ||
          type._classname !== columnClasses[expected.type] ||
          type.nullable !== (expected.nullable ?? false) ||
          column.is_pk !== (expected.primaryKey ?? false)
        )
          throw new TypeError(`Schema mismatch for column ${name}`);
      }
      return { id: table.tbl_id, version, columnIds };
    }
    let state = readMetadata(metadata);
    const id = state.id;
    const pathKey = { tbl_version: { id, effective_version: null }, base: null };
    const queries = createTableQueries(id, schema, state.columnIds, collectQuery, countQuery);
    async function collectQuery(
      query: Record<string, unknown>,
      selected: readonly string[],
      signal?: AbortSignal,
    ): Promise<CatalogRow<S>[]> {
      const response = await rpc('collect', { query }, signal, { class_name: 'Query' });
      const result = record(response.result);
      const columns = Object.entries(record(result.schema));
      if (columns.length !== selected.length || columns.some(([name]) => !selected.includes(name)))
        throw new TypeError('Query schema changed');
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
    }
    async function countQuery(query: Record<string, unknown>, signal?: AbortSignal): Promise<number> {
      const { result } = await rpc('count', { query }, signal, { class_name: 'Query' });
      if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0)
        throw new TypeError('Invalid row count');
      return result;
    }
    async function mutateMetadata(
      method: string,
      args: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<unknown> {
      const response = await rpc(method, args, signal, {
        class_name: 'Table',
        path_key: pathKey,
        snapshot_path_key: { tbl_version: { id, effective_version: state.version }, base: null },
      });
      const updated = readMetadata(response.current_md);
      if (updated.id !== id) throw new TypeError('Table identity changed');
      state = updated;
      return response.result;
    }
    async function mutate(
      method: string,
      args: Record<string, unknown>,
      countKey: string,
      signal?: AbortSignal,
    ): Promise<number> {
      const result = await mutateMetadata(method, args, signal);
      const status = record(tagged(result, 'UpdateStatus'));
      const count = record(status.row_count_stats)[countKey];
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
        throw new TypeError('Invalid mutation count');
      return count;
    }
    function predicateWire(where?: CatalogPredicate): unknown {
      return where === undefined ? null : { $pxt: 'Expr', v: where.toWire(id) };
    }
    return {
      id,
      path,
      schema,
      ...queries,
      async addBtreeIndex(column, options = {}): Promise<void> {
        if (!Object.hasOwn(schema, column) || !['int', 'float', 'string'].includes(schema[column]!.type))
          throw new TypeError('B-tree indexes require an integer, float, or string column');
        if (options.name !== undefined && (typeof options.name !== 'string' || !options.name))
          throw new TypeError('An index name must be a nonempty string');
        if (options.ifExists !== undefined && !['error', 'ignore'].includes(options.ifExists))
          throw new TypeError('Invalid ifExists option');
        await mutateMetadata(
          'add_btree_index',
          {
            column,
            idx_name: options.name ?? null,
            if_exists: options.ifExists ?? 'error',
          },
          options.signal,
        );
      },
      async dropIndex(name, options = {}): Promise<void> {
        if (typeof name !== 'string' || !name) throw new TypeError('An index name is required');
        if (options.ifNotExists !== undefined && !['error', 'ignore'].includes(options.ifNotExists))
          throw new TypeError('Invalid ifNotExists option');
        await mutateMetadata(
          'drop_index',
          {
            column: null,
            idx_name: name,
            if_not_exists: options.ifNotExists ?? 'error',
          },
          options.signal,
        );
      },
      async addComputedColumn<const N extends string, T>(
        name: N,
        expression: CatalogExpression<T>,
        options: { signal?: AbortSignal } = {},
      ): Promise<CatalogTable<S & ComputedSchema<N, T>>> {
        if (Object.hasOwn(schema, name)) throw new TypeError('Column already exists');
        const definition = expression.computedDefinition(id);
        const nextSchema = copySchema({ ...schema, [name]: definition.column }) as S & ComputedSchema<N, T>;
        const response = await rpc(
          'add_computed_column',
          {
            columns: { [name]: definition.wire },
            stored: true,
            destination: null,
            custom_metadata: null,
            comment: '',
            print_stats: false,
            on_error: 'abort',
            if_exists: 'error',
          },
          options.signal,
          {
            class_name: 'Table',
            path_key: pathKey,
            snapshot_path_key: { tbl_version: { id, effective_version: state.version }, base: null },
          },
        );
        return tableHandle(path, nextSchema, response.current_md);
      },
      async insert(
        rows: readonly CatalogInsertRow<S>[],
        options: { signal?: AbortSignal } = {},
      ): Promise<{ insertedRows: number }> {
        const wireRows = rows.map((row) => {
          const values = record(row);
          if (Object.keys(values).some((name) => !Object.hasOwn(schema, name) || schema[name]!.computed))
            throw new TypeError('Unknown insert column');
          return Object.fromEntries(
            Object.entries(schema)
              .filter(([, column]) => !column.computed)
              .map(([name, column]) => [
                name,
                columnValue(
                  Object.hasOwn(values, name) ? values[name] : column.nullable ? null : undefined,
                  column,
                  true,
                ),
              ]),
          );
        });
        const insertedRows = await mutate(
          'insert',
          { rows: wireRows, on_error: 'abort', print_stats: false, return_rows: false },
          'ins_rows',
          options.signal,
        );
        return { insertedRows };
      },
      async update(
        values: CatalogUpdateRow<S>,
        options: { where?: CatalogPredicate; signal?: AbortSignal } = {},
      ): Promise<{ updatedRows: number }> {
        const entries = Object.entries(record(values));
        if (entries.length === 0) throw new TypeError('Specify at least one update column');
        const valueSpec = Object.fromEntries(
          entries.map(([name, value]) => {
            if (!Object.hasOwn(schema, name) || schema[name]!.computed)
              throw new TypeError('Unknown or computed update column');
            return [name, updateValue(value, schema[name]!, id)];
          }),
        );
        const updatedRows = await mutate(
          'update',
          {
            value_spec: valueSpec,
            where: predicateWire(options.where),
            cascade: true,
            return_rows: false,
          },
          'upd_rows',
          options.signal,
        );
        return { updatedRows };
      },
      async delete(options: { where?: CatalogPredicate; signal?: AbortSignal } = {}): Promise<{ deletedRows: number }> {
        const deletedRows = await mutate('delete', { where: predicateWire(options.where) }, 'del_rows', options.signal);
        return { deletedRows };
      },
      async collect(options: { limit?: number; signal?: AbortSignal } = {}): Promise<CatalogRow<S>[]> {
        let query = queries.query();
        if (options.limit !== undefined) query = query.limit(options.limit);
        return query.collect(options.signal ? { signal: options.signal } : {});
      },
      async count(options: { signal?: AbortSignal } = {}): Promise<number> {
        return queries.query().count(options);
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
      if (Object.values(schema).some((column) => column.computed))
        throw new TypeError('Create base columns first, then use addComputedColumn');
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
