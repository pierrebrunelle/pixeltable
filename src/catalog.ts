export { CatalogArray, catalogArray } from './catalog-array.js';
export { catalogUuid } from './catalog-uuid.js';
export type { CatalogUuid } from './catalog-uuid.js';
import { encodeBinaryParts, decodeBinaryParts } from './catalog-binary.js';
export { catalogDate, catalogTimestamp } from './catalog-temporal.js';
export type { CatalogDate, CatalogTimestamp } from './catalog-temporal.js';
export type { CatalogJsonPathElement, CatalogCastType, CatalogWindow } from './catalog-query.js';
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
import { columnValue, copySchema, columnWire, matchesColumn } from './catalog-schema.js';
import type {
  CatalogColumn,
  CatalogSchema,
  CatalogInsertRow,
  CatalogRow,
  CatalogBatchUpdateRow,
} from './catalog-schema.js';
export type {
  CatalogColumn,
  CatalogSchema,
  CatalogRow,
  CatalogInsertRow,
  CatalogBatchUpdateRow,
  JsonValue,
} from './catalog-schema.js';

export type BtreeColumn<S extends CatalogSchema> = {
  [K in keyof S & string]: S[K]['type'] extends 'int' | 'float' | 'string' | 'date' | 'timestamp' | 'uuid' ? K : never;
}[keyof S & string];

export type TextColumn<S extends CatalogSchema> = {
  [K in keyof S & string]: S[K]['type'] extends 'string' ? K : never;
}[keyof S & string];

export interface TextEmbeddingOptions {
  /** Importable Python UDF path. The server validates its string input and vector return type. */
  embedding: string;
  name?: string;
  metric?: 'cosine' | 'ip' | 'l2';
  precision?: 'fp16' | 'fp32';
  ifExists?: 'error' | 'ignore';
  signal?: AbortSignal;
}

export type ComputedColumn<S extends CatalogSchema> = {
  [K in keyof S & string]: S[K] extends { computed: true } ? K : never;
}[keyof S & string];

export interface CatalogInsertOptions {
  onError?: 'abort' | 'ignore';
  signal?: AbortSignal;
}

export interface CatalogComputeOptions {
  onError?: 'abort' | 'ignore';
  signal?: AbortSignal;
}

export interface CatalogComputedRow<S extends CatalogSchema> {
  values: { [K in keyof CatalogRow<S>]: CatalogRow<S>[K] | null };
  errors: Record<string, { type: string; message: string }>;
}

export interface CatalogComputedColumnOptions {
  onError?: 'abort' | 'ignore';
  signal?: AbortSignal;
}

export interface RecomputeOptions {
  where?: CatalogPredicate;
  errorsOnly?: boolean;
  cascade?: boolean;
  signal?: AbortSignal;
}

export interface CatalogDropOptions {
  ifNotExists?: 'error' | 'ignore';
  /** Remove dependent views for tables, or recursively remove directory contents. */
  force?: boolean;
  signal?: AbortSignal;
}

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

export type CatalogJoinKind = 'inner' | 'left' | 'full_outer' | 'cross';
type JoinSide<S extends CatalogSchema, Nullable extends boolean> = {
  [K in keyof S]: Nullable extends true ? { type: S[K]['type']; nullable: true } : S[K];
};
export type CatalogJoinColumns<L extends CatalogSchema, R extends CatalogSchema, K extends CatalogJoinKind> = {
  left: CatalogColumns<JoinSide<L, K extends 'full_outer' ? true : false>>;
  right: CatalogColumns<JoinSide<R, K extends 'left' | 'full_outer' ? true : false>>;
};
export type CatalogJoinSchema<L extends CatalogSchema, R extends CatalogSchema, K extends CatalogJoinKind> = {
  [N in keyof L & string as `left_${N}`]: JoinSide<L, K extends 'full_outer' ? true : false>[N];
} & {
  [N in keyof R & string as `right_${N}`]: JoinSide<R, K extends 'left' | 'full_outer' ? true : false>[N];
};
export type CatalogJoinOptions<L extends CatalogSchema, R extends CatalogSchema, K extends CatalogJoinKind> = {
  how: K;
} & (K extends 'cross' ? { on?: never } : { on: (columns: CatalogJoinColumns<L, R, K>) => CatalogPredicate });
export interface CatalogJoin<L extends CatalogSchema, R extends CatalogSchema, K extends CatalogJoinKind> {
  readonly columns: CatalogJoinColumns<L, R, K>;
  query(): CatalogQuery<CatalogJoinSchema<L, R, K>>;
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
  compute(rows: readonly CatalogInsertRow<S>[], options?: CatalogComputeOptions): Promise<CatalogComputedRow<S>[]>;
  recomputeColumns(
    columns: readonly ComputedColumn<S>[],
    options?: RecomputeOptions,
  ): Promise<{ updatedRows: number; errors: number }>;
  insert(
    rows: readonly CatalogInsertRow<S>[],
    options?: CatalogInsertOptions,
  ): Promise<{ insertedRows: number; errors: number }>;
  batchUpdate(
    rows: readonly CatalogBatchUpdateRow<S>[],
    options?: {
      ifNotExists?: 'error' | 'ignore' | 'insert';
      cascade?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<{ updatedRows: number; insertedRows: number; errors: number }>;
  update(
    values: CatalogUpdateRow<S>,
    options?: { where?: CatalogPredicate; signal?: AbortSignal },
  ): Promise<{ updatedRows: number }>;
  delete(options?: { where?: CatalogPredicate; signal?: AbortSignal }): Promise<{ deletedRows: number }>;
  collect(options?: { limit?: number; signal?: AbortSignal }): Promise<CatalogRow<S>[]>;
  count(options?: { signal?: AbortSignal }): Promise<number>;
  createSnapshot(
    path: string,
    options?: { where?: CatalogPredicate; signal?: AbortSignal },
  ): Promise<CatalogSnapshot<S>>;
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
  addEmbeddingIndex(column: TextColumn<S>, options: TextEmbeddingOptions): Promise<void>;
  addBtreeIndex(
    column: BtreeColumn<S>,
    options?: { name?: string; ifExists?: 'error' | 'ignore'; signal?: AbortSignal },
  ): Promise<void>;
  dropIndex(name: string, options?: { ifNotExists?: 'error' | 'ignore'; signal?: AbortSignal }): Promise<void>;
  addComputedColumn<const N extends string, T>(
    name: N,
    expression: CatalogExpression<T>,
    options?: CatalogComputedColumnOptions,
  ): Promise<CatalogTable<S & ComputedSchema<N, T>>>;
}

export type CatalogSnapshot<S extends CatalogSchema> = Pick<
  CatalogTable<S>,
  'id' | 'path' | 'schema' | 'columns' | 'query' | 'callFunction' | 'collect' | 'count' | 'createSnapshot'
>;

export interface CatalogView<S extends CatalogSchema> extends Pick<
  CatalogTable<S>,
  | 'id'
  | 'path'
  | 'schema'
  | 'columns'
  | 'query'
  | 'callFunction'
  | 'recomputeColumns'
  | 'compute'
  | 'collect'
  | 'count'
  | 'createView'
  | 'createSnapshot'
  | 'addBtreeIndex'
  | 'addEmbeddingIndex'
  | 'dropIndex'
  | 'getVersions'
> {
  addComputedColumn<const N extends string, T>(
    name: N,
    expression: CatalogExpression<T>,
    options?: CatalogComputedColumnOptions,
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

function statusCount(values: unknown[]): number {
  if (values.some((value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0))
    throw new TypeError('Invalid mutation count');
  const total = (values as number[]).reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new TypeError('Invalid mutation count');
  return total;
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
  const sources = new WeakMap<
    object,
    {
      id: string;
      pathKey: Record<string, unknown>;
      schema: CatalogSchema;
      references: Record<string, Record<string, unknown>>;
    }
  >();
  function wrapSource<T extends object>(wrapped: T, source: object): T {
    sources.set(wrapped, sources.get(source)!);
    return wrapped;
  }
  async function rpc(
    method: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    context: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const parts: Uint8Array[] = [];
    const encodedArgs = encodeBinaryParts(args, parts);
    const head = new TextEncoder().encode(
      JSON.stringify({
        protocol_version: proxyProtocolVersion,
        schema_version: proxySchemaVersion,
        class_name: 'CatalogBase',
        method,
        args: encodedArgs,
        ...context,
      }),
    );
    const { data } = await client.api.POST('/rpc', {
      body: encodeProxyFrame(head, parts),
      bodySerializer: (body) => body,
      headers: { 'Content-Type': 'application/octet-stream' },
      parseAs: 'arrayBuffer',
      ...(signal ? { signal } : {}),
    });
    if (!data) throw new TypeError('Missing catalog response');
    const frame = decodeProxyFrame(new Uint8Array(data));
    const response = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame.head)));
    if (response.error !== null && response.error !== undefined) throw new CatalogError(record(response.error));
    if (response.is_stale_md === true) throw new CatalogStaleError();
    if (!Object.hasOwn(response, 'result')) throw new TypeError('Missing catalog result');
    return record(decodeBinaryParts(response, frame.parts));
  }
  async function call(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    return (await rpc(method, args, signal)).result;
  }
  async function collectQuery(
    query: Record<string, unknown>,
    selected: readonly string[],
    signal?: AbortSignal,
    outputSchema: CatalogSchema = {},
  ): Promise<Record<string, unknown>[]> {
    const response = await rpc('collect', { query }, signal, { class_name: 'Query' });
    const result = record(response.result);
    const columns = Object.entries(record(result.schema));
    if (columns.length !== selected.length || columns.some(([name]) => !selected.includes(name)))
      throw new TypeError('Query schema changed');
    const joins = record(query.from_clause).join_clauses;
    const outer =
      Array.isArray(joins) && joins.some((join) => ['LEFT', 'FULL_OUTER'].includes(String(record(join).join_type)));
    for (const [name, wrapped] of columns) {
      const column = outputSchema[name];
      const type = record(tagged(wrapped, 'ColumnType'));
      if (!column || !matchesColumn(type, column, outer)) throw new TypeError('Query schema changed');
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
  function tableHandle<S extends CatalogSchema>(
    path: string,
    schema: S,
    metadata: unknown,
    isView = false,
    isSnapshot = false,
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
      if (isView && (record(table.view_md).is_snapshot === true) !== isSnapshot)
        throw new TypeError(isSnapshot ? 'Expected a snapshot' : 'Expected a live view');
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
          if ((!isSnapshot && view.is_snapshot) || !view.include_base_columns || view.iterator_call !== null)
            throw new TypeError('Only views with inherited columns are supported');
        }
        const concreteVersion = record(level.version_md).version;
        if (typeof concreteVersion !== 'number' || !Number.isSafeInteger(concreteVersion) || concreteVersion < 0)
          throw new TypeError('Invalid base version');
        snapshotKey = { tbl_version: { id: owner.tbl_id, effective_version: concreteVersion }, base: snapshotKey };
        const view = owner.view_md === null ? null : record(owner.view_md);
        const pureSnapshot =
          view?.is_snapshot === true &&
          view.sample_clause === null &&
          view.predicate === null &&
          Object.keys(record(owner.column_md)).length === 0;
        if (!pureSnapshot)
          pathKey = {
            tbl_version: { id: owner.tbl_id, effective_version: isSnapshot ? concreteVersion : null },
            base: pathKey,
          };
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
          (column.value_expr !== null) !== (expected.computed ?? false) ||
          !matchesColumn(type, expected) ||
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
    function encodeRows(rows: readonly CatalogInsertRow<S>[]): Record<string, unknown>[] {
      return rows.map((row) => {
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
    }
    function predicateWire(where?: CatalogPredicate): unknown {
      return where === undefined ? null : { $pxt: 'Expr', v: where.toWire(id) };
    }
    async function createDerived(
      viewPath: string,
      options: { where?: CatalogPredicate; signal?: AbortSignal },
      snapshot: boolean,
    ): Promise<unknown> {
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
            is_snapshot: snapshot,
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
      return result[0];
    }
    const handle: CatalogTable<S> = {
      id,
      path,
      schema,
      ...queries,
      callFunction(fn, args) {
        return callCatalogFunction(id, fn, args);
      },
      async createView(viewPath, options = {}): Promise<CatalogView<S>> {
        return viewHandle(viewPath, schema, await createDerived(viewPath, options, false));
      },
      async createSnapshot(snapshotPath, options = {}): Promise<CatalogSnapshot<S>> {
        return snapshotHandle(snapshotPath, schema, await createDerived(snapshotPath, options, true));
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
                v: columnWire(definition),
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
      async addEmbeddingIndex(column, options): Promise<void> {
        if (!Object.hasOwn(schema, column) || schema[column]!.type !== 'string')
          throw new TypeError('Text embedding indexes require a string column');
        if (typeof options.embedding !== 'string' || !/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/.test(options.embedding))
          throw new TypeError('Embedding must be an importable Python function path');
        if (options.name !== undefined && (typeof options.name !== 'string' || !options.name))
          throw new TypeError('An index name must be a nonempty string');
        if (options.metric !== undefined && !['cosine', 'ip', 'l2'].includes(options.metric))
          throw new TypeError('Invalid embedding metric');
        if (options.precision !== undefined && !['fp16', 'fp32'].includes(options.precision))
          throw new TypeError('Invalid embedding precision');
        if (options.ifExists !== undefined && !['error', 'ignore'].includes(options.ifExists))
          throw new TypeError('Invalid ifExists option');
        await mutateMetadata(
          'add_embedding_index',
          {
            column,
            idx_name: options.name ?? null,
            embedding: {
              $pxt: 'Function',
              v: {
                _classpath: 'pixeltable.func.callable_function.CallableFunction',
                path: options.embedding,
              },
            },
            string_embed: null,
            image_embed: null,
            metric: options.metric ?? 'cosine',
            precision: options.precision ?? 'fp16',
            if_exists: options.ifExists ?? 'error',
          },
          options.signal,
        );
      },
      async addBtreeIndex(column, options = {}): Promise<void> {
        if (
          !Object.hasOwn(schema, column) ||
          !['int', 'float', 'string', 'date', 'timestamp', 'uuid'].includes(schema[column]!.type)
        )
          throw new TypeError('B-tree indexes require an integer, float, string, date, timestamp, or UUID column');
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
        options: CatalogComputedColumnOptions = {},
      ): Promise<CatalogTable<S & ComputedSchema<N, T>>> {
        if (options.onError !== undefined && !['abort', 'ignore'].includes(options.onError))
          throw new TypeError('Invalid onError policy');
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
            on_error: options.onError ?? 'abort',
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
      async compute(rows, options = {}): Promise<CatalogComputedRow<S>[]> {
        if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('Compute requires a nonempty array of rows');
        if (options.onError !== undefined && !['abort', 'ignore'].includes(options.onError))
          throw new TypeError('Invalid onError policy');
        const response = await rpc(
          'compute',
          { rows: encodeRows(rows), on_error: options.onError ?? 'abort' },
          options.signal,
          {
            class_name: 'Table',
            path_key: pathKey,
            snapshot_path_key: state.snapshotKey,
          },
        );
        const batch = record(tagged(response.result, 'RowBatch'));
        const columns = Object.entries(record(batch.schema));
        if (columns.length !== Object.keys(schema).length) throw new TypeError('Compute schema changed');
        for (const [name, raw] of columns) {
          const type = record(raw);
          const expected = schema[name];
          if (!expected || !matchesColumn(type, expected)) throw new TypeError('Compute schema changed');
        }
        if (
          !Array.isArray(batch.rows) ||
          !Array.isArray(batch.errors) ||
          !Array.isArray(batch.index_values) ||
          batch.rows.length !== batch.errors.length ||
          batch.rows.length !== batch.index_values.length
        )
          throw new TypeError('Invalid computed row batch');
        const errors = batch.errors;
        const indexes = batch.index_values;
        return batch.rows.map((row: unknown, index: number) => {
          if (!Array.isArray(row) || row.length !== columns.length) throw new TypeError('Invalid computed row');
          if (Object.keys(record(indexes[index])).length)
            throw new TypeError('Computed index values are not supported yet');
          const cellErrors = Object.fromEntries(
            Object.entries(record(errors[index])).map(([name, raw]) => {
              const error = record(raw);
              if (typeof error.errortype !== 'string' || typeof error.errormsg !== 'string')
                throw new TypeError('Invalid computed cell error');
              return [name, { type: error.errortype, message: error.errormsg }];
            }),
          );
          const values = Object.fromEntries(
            columns.map(([name], position) => [
              name,
              columnValue(
                row[position],
                { ...schema[name]!, nullable: Object.hasOwn(cellErrors, name) || schema[name]!.nullable === true },
                false,
              ),
            ]),
          );
          return { values: values as CatalogComputedRow<S>['values'], errors: cellErrors };
        });
      },
      async insert(
        rows: readonly CatalogInsertRow<S>[],
        options: CatalogInsertOptions = {},
      ): Promise<{ insertedRows: number; errors: number }> {
        if (options.onError !== undefined && !['abort', 'ignore'].includes(options.onError))
          throw new TypeError('Invalid onError policy');
        const wireRows = encodeRows(rows);
        const result = await mutateMetadata(
          'insert',
          { rows: wireRows, on_error: options.onError ?? 'abort', print_stats: false, return_rows: false },
          options.signal,
        );
        const status = record(tagged(result, 'UpdateStatus'));
        const own = record(status.row_count_stats);
        const cascaded = record(status.cascade_row_count_stats);
        return { insertedRows: statusCount([own.ins_rows]), errors: statusCount([own.num_excs, cascaded.num_excs]) };
      },
      async batchUpdate(rows, options = {}): Promise<{ updatedRows: number; insertedRows: number; errors: number }> {
        const keys = Object.entries(schema)
          .filter(([, column]) => column.primaryKey)
          .map(([name]) => name);
        if (keys.length === 0) throw new TypeError('Batch updates require a primary key');
        if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('Batch updates require a nonempty array');
        if (options.ifNotExists !== undefined && !['error', 'ignore', 'insert'].includes(options.ifNotExists))
          throw new TypeError('Invalid ifNotExists policy');
        if (options.cascade !== undefined && typeof options.cascade !== 'boolean')
          throw new TypeError('Cascade must be boolean');
        const encoded = Array.from(rows, (row) => {
          const values = record(row);
          if (keys.some((key) => !Object.hasOwn(values, key)))
            throw new TypeError('Every row requires all primary key columns');
          return Object.fromEntries(
            Object.entries(values).map(([name, value]) => {
              if (!Object.hasOwn(schema, name) || schema[name]!.computed)
                throw new TypeError('Unknown or computed update column');
              return [name, columnValue(value, schema[name]!, true)];
            }),
          );
        });
        const result = await mutateMetadata(
          'batch_update',
          {
            rows: encoded,
            cascade: options.cascade ?? true,
            if_not_exists: options.ifNotExists ?? 'error',
            return_rows: false,
          },
          options.signal,
        );
        const status = record(tagged(result, 'UpdateStatus'));
        const own = record(status.row_count_stats);
        const cascaded = record(status.cascade_row_count_stats);
        return {
          updatedRows: statusCount([own.upd_rows, cascaded.upd_rows]),
          insertedRows: statusCount([own.ins_rows, cascaded.ins_rows]),
          errors: statusCount([own.num_excs, cascaded.num_excs]),
        };
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
      async recomputeColumns(columns, options = {}): Promise<{ updatedRows: number; errors: number }> {
        if (!Array.isArray(columns) || columns.length === 0 || new Set(columns).size !== columns.length)
          throw new TypeError('Specify distinct computed columns');
        for (const name of columns) {
          if (!Object.hasOwn(schema, name) || !schema[name]!.computed)
            throw new TypeError('Recomputation requires computed columns');
          const owner = state.columnIds[name];
          if (typeof owner !== 'number' && owner?.tableId !== id)
            throw new TypeError('Recompute inherited columns through their base table');
        }
        for (const value of [options.errorsOnly, options.cascade])
          if (value !== undefined && typeof value !== 'boolean') throw new TypeError('Recompute flags must be boolean');
        if (options.errorsOnly && columns.length !== 1) throw new TypeError('errorsOnly requires exactly one column');
        const result = await mutateMetadata(
          'recompute_columns',
          {
            columns: [...columns],
            where: predicateWire(options.where),
            errors_only: options.errorsOnly ?? false,
            cascade: options.cascade ?? true,
          },
          options.signal,
        );
        const status = record(tagged(result, 'UpdateStatus'));
        const own = record(status.row_count_stats);
        const cascaded = record(status.cascade_row_count_stats);
        return {
          updatedRows: statusCount([own.upd_rows, cascaded.upd_rows]),
          errors: statusCount([own.num_excs, cascaded.num_excs]),
        };
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
    sources.set(handle, {
      id,
      pathKey,
      schema,
      references: Object.fromEntries(
        Object.entries(queries.columns).map(([name, expression]) => [
          name,
          expression.computedDefinition(id).wire.v as Record<string, unknown>,
        ]),
      ),
    });
    return handle;
  }
  function snapshotHandle<S extends CatalogSchema>(path: string, schema: S, metadata: unknown): CatalogSnapshot<S> {
    const table = tableHandle(path, schema, metadata, true, true);
    return wrapSource(
      {
        id: table.id,
        path: table.path,
        schema: table.schema,
        columns: table.columns,
        query: table.query,
        callFunction: table.callFunction,
        collect: table.collect,
        count: table.count,
        createSnapshot: table.createSnapshot,
      },
      table,
    );
  }
  function viewHandle<S extends CatalogSchema>(path: string, schema: S, metadata: unknown): CatalogView<S> {
    return asView(tableHandle(path, schema, metadata, true));
  }
  function asView<S extends CatalogSchema>(table: CatalogTable<S>): CatalogView<S> {
    return wrapSource(
      {
        id: table.id,
        path: table.path,
        schema: table.schema,
        columns: table.columns,
        query: table.query,
        callFunction: table.callFunction,
        recomputeColumns: table.recomputeColumns,
        compute: table.compute,
        collect: table.collect,
        count: table.count,
        createView: table.createView,
        createSnapshot: table.createSnapshot,
        addBtreeIndex: table.addBtreeIndex,
        addEmbeddingIndex: table.addEmbeddingIndex,
        dropIndex: table.dropIndex,
        getVersions: table.getVersions,
        async addComputedColumn(name, expression, options) {
          return asView(await table.addComputedColumn(name, expression, options));
        },
      },
      table,
    );
  }
  async function dropObject(
    method: 'drop_table' | 'drop_dir',
    path: string,
    options: CatalogDropOptions,
  ): Promise<void> {
    if (!path) throw new TypeError('A non-root catalog path is required');
    if (options.ifNotExists !== undefined && !['error', 'ignore'].includes(options.ifNotExists))
      throw new TypeError('Invalid ifNotExists option');
    if (options.force !== undefined && typeof options.force !== 'boolean')
      throw new TypeError('Force must be a boolean');
    await call(
      method,
      {
        path: pathValue(path),
        if_not_exists: { $pxt: 'IfNotExistsParam', v: options.ifNotExists === 'ignore' ? 'IGNORE' : 'ERROR' },
        force: options.force ?? false,
      },
      options.signal,
    );
  }
  return {
    join<L extends CatalogSchema, R extends CatalogSchema, const K extends CatalogJoinKind>(
      left: Pick<CatalogTable<L>, 'schema' | 'columns'>,
      right: Pick<CatalogTable<R>, 'schema' | 'columns'>,
      options: CatalogJoinOptions<L, R, K>,
    ): CatalogJoin<L, R, K> {
      const leftSource = sources.get(left);
      const rightSource = sources.get(right);
      if (!leftSource || !rightSource) throw new TypeError('Join sources must be handles from this catalog client');
      if (
        leftSource.id === rightSource.id ||
        JSON.stringify(leftSource.pathKey) === JSON.stringify(rightSource.pathKey)
      )
        throw new TypeError('Self joins require aliases and are not supported');
      const how = options.how;
      if (!['inner', 'left', 'full_outer', 'cross'].includes(how)) throw new TypeError('Unsupported join type');
      if ((how === 'cross' && options.on !== undefined) || (how !== 'cross' && typeof options.on !== 'function'))
        throw new TypeError('Non-cross joins require on; cross joins must omit on');
      const scope = `join:${globalThis.crypto.randomUUID()}`;
      const schema: CatalogSchema = {};
      const references: Record<string, Record<string, unknown>> = {};
      for (const [side, source] of [
        ['left', leftSource],
        ['right', rightSource],
      ] as const) {
        const nullable = how === 'full_outer' || (how === 'left' && side === 'right');
        for (const [name, column] of Object.entries(source.schema)) {
          schema[`${side}_${name}`] = { ...column, nullable: nullable || (column.nullable ?? false) };
          references[`${side}_${name}`] = source.references[name]!;
        }
      }
      const fromClause = {
        tbls: [leftSource.pathKey, rightSource.pathKey],
        join_clauses: [] as Record<string, unknown>[],
      };
      const builder = createTableQueries(
        scope,
        schema as CatalogJoinSchema<L, R, K>,
        {},
        collectQuery,
        countQuery,
        leftSource.pathKey,
        { references, fromClause },
      );
      const columns = Object.freeze(
        Object.fromEntries(
          (['left', 'right'] as const).map((side) => [
            side,
            Object.freeze(
              Object.fromEntries(
                Object.keys(side === 'left' ? leftSource.schema : rightSource.schema).map((name) => [
                  name,
                  builder.columns[`${side}_${name}` as keyof CatalogJoinSchema<L, R, K> & string],
                ]),
              ),
            ),
          ]),
        ),
      ) as CatalogJoinColumns<L, R, K>;
      const predicate =
        how === 'cross'
          ? null
          : (options.on as (columns: CatalogJoinColumns<L, R, K>) => CatalogPredicate)(columns).toWire(scope);
      fromClause.join_clauses.push({ join_type: how.toUpperCase(), join_predicate: predicate });
      return { columns, query: builder.query } as CatalogJoin<L, R, K>;
    },
    async dropTable(path: string, options: CatalogDropOptions = {}): Promise<void> {
      await dropObject('drop_table', path, options);
    },
    async dropDirectory(path: string, options: CatalogDropOptions = {}): Promise<void> {
      await dropObject('drop_dir', path, options);
    },
    async move(
      path: string,
      newPath: string,
      options: {
        ifExists?: 'error' | 'ignore';
        ifNotExists?: 'error' | 'ignore';
        signal?: AbortSignal;
      } = {},
    ): Promise<void> {
      if (!path || !newPath) throw new TypeError('Non-root source and destination paths are required');
      if (options.ifExists !== undefined && !['error', 'ignore'].includes(options.ifExists))
        throw new TypeError('Invalid ifExists option');
      if (options.ifNotExists !== undefined && !['error', 'ignore'].includes(options.ifNotExists))
        throw new TypeError('Invalid ifNotExists option');
      await call(
        'move',
        {
          path: pathValue(path),
          new_path: pathValue(newPath),
          if_exists: { $pxt: 'IfExistsParam', v: options.ifExists === 'ignore' ? 'IGNORE' : 'ERROR' },
          if_not_exists: { $pxt: 'IfNotExistsParam', v: options.ifNotExists === 'ignore' ? 'IGNORE' : 'ERROR' },
        },
        options.signal,
      );
    },
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
                    v: columnWire(column),
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
    async openSnapshot<const S extends CatalogSchema>(
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
      return snapshotHandle(path, schema, result);
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
