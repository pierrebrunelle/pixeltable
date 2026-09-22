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
  CatalogFunction,
  CatalogFunctionArgs,
} from './catalog-query.js';
import { createTableQueries, updateValue, callCatalogFunction } from './catalog-query.js';
export { defineCatalogFunction } from './catalog-query.js';
export type {
  CatalogQuery,
  CatalogColumns,
  CatalogPredicate,
  CatalogUpdateRow,
  CatalogExpression,
  CatalogProjection,
  CatalogFunction,
  CatalogFunctionArgs,
} from './catalog-query.js';
import { columnClasses, columnValue, copySchema } from './catalog-schema.js';
import type { CatalogColumn, CatalogSchema, CatalogInsertRow, CatalogRow } from './catalog-schema.js';
export type { CatalogColumn, CatalogSchema, CatalogRow, CatalogInsertRow, JsonValue } from './catalog-schema.js';

export type BtreeColumn<S extends CatalogSchema> = {
  [K in keyof S & string]: S[K]['type'] extends 'int' | 'float' | 'string' ? K : never;
}[keyof S & string];

export interface CatalogVersion {
  version: number;
  createdAt: string;
  user: string | null;
  changeType: 'data' | 'schema';
  inserts: number;
  updates: number;
  deletes: number;
  errors: number;
  schemaChange: string | null;
}

export interface CatalogTable<S extends CatalogSchema> {
  readonly id: string;
  readonly path: string;
  readonly schema: S;
  readonly columns: CatalogColumns<S>;
  callFunction<P extends CatalogSchema, C extends CatalogColumn>(
    fn: CatalogFunction<P, C>,
    args: CatalogFunctionArgs<P>,
  ): CatalogExpression<CatalogRow<{ result: C }>['result']>;
  query(): CatalogQuery<S>;
  insert(rows: readonly CatalogInsertRow<S>[], options?: { signal?: AbortSignal }): Promise<{ insertedRows: number }>;
  update(
    values: CatalogUpdateRow<S>,
    options?: { where?: CatalogPredicate; signal?: AbortSignal },
  ): Promise<{ updatedRows: number }>;
  delete(options?: { where?: CatalogPredicate; signal?: AbortSignal }): Promise<{ deletedRows: number }>;
  collect(options?: { limit?: number; signal?: AbortSignal }): Promise<CatalogRow<S>[]>;
  count(options?: { signal?: AbortSignal }): Promise<number>;
  createView(path: string, options?: { where?: CatalogPredicate; signal?: AbortSignal }): Promise<CatalogView<S>>;
  getVersions(options?: { limit?: number; signal?: AbortSignal }): Promise<CatalogVersion[]>;
  revert<const R extends CatalogSchema>(schema: R, options?: { signal?: AbortSignal }): Promise<CatalogTable<R>>;
  addColumn<const N extends string, const C extends CatalogColumn>(
    name: N,
    definition: C,
    options?: { signal?: AbortSignal },
  ): Promise<CatalogTable<S & Record<N, C>>>;
  renameColumn<K extends keyof S & string, const N extends string>(
    name: K,
    newName: N,
    options?: { signal?: AbortSignal },
  ): Promise<CatalogTable<Omit<S, K> & Record<N, S[K]>>>;
  dropColumn<K extends keyof S & string>(
    name: K,
    options?: { signal?: AbortSignal },
  ): Promise<CatalogTable<Omit<S, K>>>;
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

export interface CatalogView<S extends CatalogSchema> extends Pick<
  CatalogTable<S>,
  | 'id'
  | 'path'
  | 'schema'
  | 'columns'
  | 'query'
  | 'callFunction'
  | 'collect'
  | 'count'
  | 'createView'
  | 'addBtreeIndex'
  | 'dropIndex'
  | 'getVersions'
> {
  addComputedColumn<const N extends string, T>(
    name: N,
    expression: CatalogExpression<T>,
    options?: { signal?: AbortSignal },
  ): Promise<CatalogView<S & ComputedSchema<N, T>>>;
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
  function tableHandle<S extends CatalogSchema>(
    path: string,
    schema: S,
    metadata: unknown,
    isView = false,
  ): CatalogTable<S> {
    function readMetadata(value: unknown): {
      id: string;
      version: number;
      columnIds: Record<string, { id: number; tableId: string }>;
      pathKey: Record<string, unknown>;
      snapshotKey: Record<string, unknown>;
    } {
      if (!Array.isArray(value) || value.length === 0 || (!isView && value.length !== 1))
        throw new TypeError('Unexpected table metadata');
      const levels = value.map((entry) => record(tagged(entry, 'TableVersionMd')));
      const table = record(levels[0]!.tbl_md);
      if (typeof table.tbl_id !== 'string' || (table.view_md !== null) !== isView)
        throw new TypeError(isView ? 'Expected a view' : 'Expected a base table');
      const version = record(levels[0]!.version_md).version;
      if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0)
        throw new TypeError('Invalid table version');
      const columnIds: Record<string, { id: number; tableId: string }> = {};
      const visible = new Map<string, Record<string, unknown>>();
      let pathKey: Record<string, unknown> | null = null;
      let snapshotKey: Record<string, unknown> | null = null;
      for (const level of [...levels].reverse()) {
        const owner = record(level.tbl_md);
        if (typeof owner.tbl_id !== 'string') throw new TypeError('Invalid table identity');
        if (owner.view_md !== null) {
          const view = record(owner.view_md);
          if (view.is_snapshot || !view.include_base_columns || view.iterator_call !== null)
            throw new TypeError('Only live views with inherited columns are supported');
        }
        const concreteVersion = record(level.version_md).version;
        if (typeof concreteVersion !== 'number' || !Number.isSafeInteger(concreteVersion) || concreteVersion < 0)
          throw new TypeError('Invalid base version');
        snapshotKey = { tbl_version: { id: owner.tbl_id, effective_version: concreteVersion }, base: snapshotKey };
        pathKey = { tbl_version: { id: owner.tbl_id, effective_version: null }, base: pathKey };
        for (const [id, raw] of Object.entries(record(record(level.schema_version_md).columns))) {
          const column = record(raw);
          if (column.name === null) continue;
          if (typeof column.name !== 'string' || !Number.isSafeInteger(Number(id)) || Number(id) < 0)
            throw new TypeError('Invalid column metadata');
          visible.set(column.name, column);
          columnIds[column.name] = { id: Number(id), tableId: owner.tbl_id };
        }
      }
      const columns = [...visible.values()];
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
      return { id: table.tbl_id, version, columnIds, pathKey: pathKey!, snapshotKey: snapshotKey! };
    }
    let state = readMetadata(metadata);
    const id = state.id;
    const pathKey = state.pathKey;
    const queries = createTableQueries(id, schema, state.columnIds, collectQuery, countQuery, pathKey);
    async function collectQuery(
      query: Record<string, unknown>,
      selected: readonly string[],
      signal?: AbortSignal,
      outputSchema: CatalogSchema = schema,
    ): Promise<Record<string, unknown>[]> {
      const response = await rpc('collect', { query }, signal, { class_name: 'Query' });
      const result = record(response.result);
      const columns = Object.entries(record(result.schema));
      if (columns.length !== selected.length || columns.some(([name]) => !selected.includes(name)))
        throw new TypeError('Query schema changed');
      for (const [name, wrapped] of columns) {
        const column = outputSchema[name];
        const type = record(tagged(wrapped, 'ColumnType'));
        if (!column || type._classname !== columnClasses[column.type] || type.nullable !== (column.nullable ?? false))
          throw new TypeError('Query schema changed');
      }
      if (!Array.isArray(result.rows)) throw new TypeError('Invalid query rows');
      return result.rows.map((row: unknown) => {
        if (!Array.isArray(row) || row.length !== columns.length) throw new TypeError('Invalid query row');
        return Object.fromEntries(
          columns.map(([name], index) => [name, columnValue(row[index], outputSchema[name]!, false)]),
        );
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
        snapshot_path_key: state.snapshotKey,
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
    async function changeSchema<R extends CatalogSchema>(
      method: string,
      args: Record<string, unknown>,
      definition: R,
      signal?: AbortSignal,
    ): Promise<CatalogTable<R>> {
      const nextSchema = copySchema(definition);
      const response = await rpc(method, args, signal, {
        class_name: 'Table',
        path_key: pathKey,
        snapshot_path_key: state.snapshotKey,
      });
      const updated = tableHandle(path, nextSchema, response.current_md, isView);
      if (updated.id !== id) throw new TypeError('Table identity changed');
      return updated;
    }
    function predicateWire(where?: CatalogPredicate): unknown {
      return where === undefined ? null : { $pxt: 'Expr', v: where.toWire(id) };
    }
    return {
      id,
      path,
      schema,
      ...queries,
      callFunction(fn, args) {
        return callCatalogFunction(id, fn, args);
      },
      async createView(viewPath, options = {}): Promise<CatalogView<S>> {
        if (!viewPath) throw new TypeError('A view path is required');
        const result = tagged(
          await call(
            'create_view',
            {
              path: pathValue(viewPath),
              base: { $pxt: 'TablePathKey', v: pathKey },
              select_list: null,
              where: predicateWire(options.where),
              sample_clause: null,
              additional_columns: {},
              is_snapshot: false,
              has_default_idxs: false,
              iterator: null,
              comment: null,
              custom_metadata: null,
              media_validation: { $pxt: 'MediaValidation', v: 'ON_WRITE' },
              if_exists: { $pxt: 'IfExistsParam', v: 'ERROR' },
            },
            options.signal,
          ),
          'tuple',
        );
        if (!Array.isArray(result) || result.length !== 2 || typeof result[1] !== 'boolean')
          throw new TypeError('Invalid create-view response');
        return viewHandle(viewPath, schema, result[0]);
      },
      async getVersions(options = {}): Promise<CatalogVersion[]> {
        if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1))
          throw new TypeError('Version limit must be a positive safe integer');
        const { result } = await rpc('get_versions', { n: options.limit ?? null }, options.signal, {
          class_name: 'Table',
          path_key: pathKey,
          snapshot_path_key: state.snapshotKey,
        });
        if (!Array.isArray(result)) throw new TypeError('Invalid version history');
        return result.map((value: unknown) => {
          const version = record(value);
          for (const name of ['version', 'inserts', 'updates', 'deletes', 'errors']) {
            const count = version[name];
            if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
              throw new TypeError('Invalid version count');
          }
          const createdAt = tagged(version.created_at, 'datetime');
          if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)))
            throw new TypeError('Invalid version timestamp');
          if (
            (version.user !== null && typeof version.user !== 'string') ||
            (version.schema_change !== null && typeof version.schema_change !== 'string') ||
            (version.change_type !== 'data' && version.change_type !== 'schema')
          )
            throw new TypeError('Invalid version metadata');
          return {
            version: version.version as number,
            createdAt,
            user: version.user as string | null,
            changeType: version.change_type as 'data' | 'schema',
            inserts: version.inserts as number,
            updates: version.updates as number,
            deletes: version.deletes as number,
            errors: version.errors as number,
            schemaChange: version.schema_change as string | null,
          };
        });
      },
      async revert<const R extends CatalogSchema>(
        definition: R,
        options: { signal?: AbortSignal } = {},
      ): Promise<CatalogTable<R>> {
        const nextSchema = copySchema(definition);
        const response = await rpc('revert', {}, options.signal, {
          class_name: 'Table',
          path_key: pathKey,
          snapshot_path_key: state.snapshotKey,
        });
        const reverted = tableHandle(path, nextSchema, response.current_md);
        if (reverted.id !== id) throw new TypeError('Table identity changed');
        return reverted;
      },
      async addColumn<const N extends string, const C extends CatalogColumn>(
        name: N,
        definition: C,
        options: { signal?: AbortSignal } = {},
      ): Promise<CatalogTable<S & Record<N, C>>> {
        if (Object.hasOwn(schema, name)) throw new TypeError('Column already exists');
        if (definition.computed || definition.primaryKey)
          throw new TypeError(
            'Added columns cannot be computed or primary keys; use addComputedColumn for expressions',
          );
        const nextSchema = { ...schema, [name]: definition } as S & Record<N, C>;
        return changeSchema(
          'add_column',
          {
            columns: {
              [name]: {
                $pxt: 'ColumnType',
                v: {
                  _classname: columnClasses[definition.type],
                  nullable: definition.nullable ?? false,
                },
              },
            },
            if_exists: 'error',
          },
          nextSchema,
          options.signal,
        );
      },
      async renameColumn<K extends keyof S & string, const N extends string>(
        name: K,
        newName: N,
        options: { signal?: AbortSignal } = {},
      ): Promise<CatalogTable<Omit<S, K> & Record<N, S[K]>>> {
        if (!Object.hasOwn(schema, name)) throw new TypeError('Unknown column');
        if (Object.hasOwn(schema, newName)) throw new TypeError('Column already exists');
        const nextSchema = Object.fromEntries(
          Object.entries(schema).map(([key, column]) => [key === name ? newName : key, column]),
        ) as Omit<S, K> & Record<N, S[K]>;
        return changeSchema('rename_column', { old_name: name, new_name: newName }, nextSchema, options.signal);
      },
      async dropColumn<K extends keyof S & string>(
        name: K,
        options: { signal?: AbortSignal } = {},
      ): Promise<CatalogTable<Omit<S, K>>> {
        if (!Object.hasOwn(schema, name)) throw new TypeError('Unknown column');
        const nextSchema = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== name)) as Omit<S, K>;
        return changeSchema('drop_column', { column: name, if_not_exists: 'error' }, nextSchema, options.signal);
      },
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
            snapshot_path_key: state.snapshotKey,
          },
        );
        return tableHandle(path, nextSchema, response.current_md, isView);
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
  function viewHandle<S extends CatalogSchema>(path: string, schema: S, metadata: unknown): CatalogView<S> {
    return asView(tableHandle(path, schema, metadata, true));
  }
  function asView<S extends CatalogSchema>(table: CatalogTable<S>): CatalogView<S> {
    return {
      id: table.id,
      path: table.path,
      schema: table.schema,
      columns: table.columns,
      query: table.query,
      callFunction: table.callFunction,
      collect: table.collect,
      count: table.count,
      createView: table.createView,
      addBtreeIndex: table.addBtreeIndex,
      dropIndex: table.dropIndex,
      getVersions: table.getVersions,
      async addComputedColumn(name, expression, options) {
        return asView(await table.addComputedColumn(name, expression, options));
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
    async openView<const S extends CatalogSchema>(path: string, definition: S, options: { signal?: AbortSignal } = {}) {
      const schema = copySchema(definition);
      const result = await call(
        'get_table',
        { path: pathValue(path), if_not_exists: { $pxt: 'IfNotExistsParam', v: 'ERROR' } },
        options.signal,
      );
      return viewHandle(path, schema, result);
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
