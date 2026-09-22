import { catalogDate, catalogTimestamp } from './catalog-temporal.js';
import type { CatalogDate, CatalogTimestamp } from './catalog-temporal.js';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface CatalogColumn {
  type: 'int' | 'float' | 'string' | 'bool' | 'json' | 'date' | 'timestamp' | 'binary';
  nullable?: boolean;
  primaryKey?: boolean;
  computed?: boolean;
}
export type CatalogSchema = Record<string, CatalogColumn>;
type ValueTypes = {
  binary: Uint8Array;
  date: CatalogDate;
  timestamp: CatalogTimestamp;
  string: string;
  bool: boolean;
  json: Exclude<JsonValue, null>;
  int: number;
  float: number;
};
type AllowsNull<C extends CatalogColumn> = 'nullable' extends keyof C
  ? true extends C['nullable']
    ? true
    : false
  : false;
type ColumnValue<C extends CatalogColumn> = ValueTypes[C['type']] | (AllowsNull<C> extends true ? null : never);
export type CatalogRow<S extends CatalogSchema> = { [K in keyof S & string]: ColumnValue<S[K]> };
export type WritableColumn<S extends CatalogSchema> = {
  [K in keyof S & string]: S[K] extends { computed: true } ? never : K;
}[keyof S & string];
export type CatalogInsertRow<S extends CatalogSchema> = {
  [K in WritableColumn<S> as AllowsNull<S[K]> extends true ? never : K]: ColumnValue<S[K]>;
} & { [K in WritableColumn<S> as AllowsNull<S[K]> extends true ? K : never]?: ColumnValue<S[K]> };

type PrimaryKeyColumn<S extends CatalogSchema> = {
  [K in keyof S & string]: S[K] extends { primaryKey: true } ? K : never;
}[keyof S & string];
export type CatalogBatchUpdateRow<S extends CatalogSchema> = [PrimaryKeyColumn<S>] extends [never]
  ? never
  : Pick<CatalogRow<S>, PrimaryKeyColumn<S>> & Partial<Pick<CatalogRow<S>, WritableColumn<S>>>;

export const columnClasses = {
  binary: 'BinaryType',
  int: 'IntType',
  float: 'FloatType',
  string: 'StringType',
  bool: 'BoolType',
  json: 'JsonType',
  date: 'DateType',
  timestamp: 'TimestampType',
} as const;

export function copySchema<S extends CatalogSchema>(schema: S): S {
  if (Object.keys(schema).length === 0) throw new TypeError('A table needs at least one column');
  const entries = Object.entries(schema).map(([name, column]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name))
      throw new TypeError('Column names must be lowercase identifiers starting with a letter');
    if (Object.keys(column).some((key) => !['type', 'nullable', 'primaryKey', 'computed'].includes(key)))
      throw new TypeError('Unsupported column option');
    if (!Object.hasOwn(column, 'type') || !Object.hasOwn(columnClasses, column.type))
      throw new TypeError(`Unsupported column type: ${column.type}`);
    if (column.nullable !== undefined && typeof column.nullable !== 'boolean')
      throw new TypeError('nullable must be boolean');
    if (column.primaryKey !== undefined && typeof column.primaryKey !== 'boolean')
      throw new TypeError('primaryKey must be boolean');
    if (column.computed !== undefined && typeof column.computed !== 'boolean')
      throw new TypeError('computed must be boolean');
    if (column.computed && column.primaryKey) throw new TypeError('Computed columns cannot be primary keys');
    if (column.primaryKey && column.nullable) throw new TypeError('Primary keys cannot be nullable');
    return [name, Object.freeze({ ...column })];
  });
  return Object.freeze(Object.fromEntries(entries)) as S;
}

export function jsonValue(value: unknown, escapeTags: boolean): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      throw new TypeError('Numbers must be finite and integers must be safe');
    return value;
  }
  if (Array.isArray(value)) return Array.from(value, (item) => jsonValue(item, escapeTags));
  if (
    typeof value !== 'object' ||
    value === null ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError('Expected a JSON value');
  const entries = Object.entries(value).map(([key, item]) => [key, jsonValue(item, escapeTags)]);
  return escapeTags && Object.hasOwn(value, '$pxt') ? { $pxt: 'rawdict', v: entries } : Object.fromEntries(entries);
}

export function decodeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeJson);
  if (typeof value !== 'object' || value === null) return jsonValue(value, false);
  const object = value as Record<string, unknown>;
  if (Object.hasOwn(object, '$pxt')) {
    if (object.$pxt !== 'rawdict' || !Array.isArray(object.v)) throw new TypeError('Unsupported tagged JSON value');
    return Object.fromEntries(
      object.v.map((entry: unknown) => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string')
          throw new TypeError('Invalid tagged JSON dictionary');
        return [entry[0], decodeJson(entry[1])];
      }),
    );
  }
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, decodeJson(item)]));
}

export function columnValue(value: unknown, column: CatalogColumn, input: boolean): unknown {
  if (value === null) {
    if (!column.nullable) throw new TypeError('A non-nullable column requires a value');
    return null;
  }
  if (column.type === 'binary') {
    if (!(value instanceof Uint8Array)) throw new TypeError('Binary values must be Uint8Array');
    return new Uint8Array(value);
  }
  if (column.type === 'date' || column.type === 'timestamp') {
    const tag = column.type === 'date' ? 'date' : 'datetime';
    const parse = column.type === 'date' ? catalogDate : catalogTimestamp;
    if (input) return { $pxt: tag, v: parse(value as string) };
    if (typeof value !== 'object' || value === null || !('$pxt' in value) || value.$pxt !== tag || !('v' in value))
      throw new TypeError(`Invalid ${column.type} wire value`);
    return parse(value.v as string);
  }
  if (column.type === 'json') return input ? jsonValue(value, true) : decodeJson(value);
  if (column.type === 'string' && typeof value === 'string') return value;
  if (column.type === 'bool' && typeof value === 'boolean') return value;
  if ((column.type === 'int' || column.type === 'float') && typeof value === 'number' && Number.isFinite(value)) {
    if (column.type === 'int' && !Number.isSafeInteger(value)) throw new TypeError('Int values must be safe integers');
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new TypeError('Unsafe integer value');
    return value;
  }
  throw new TypeError(`Invalid ${column.type} value`);
}

export function literalValue(value: unknown, column: CatalogColumn): unknown {
  const encoded = columnValue(value, column, true);
  if (column.type === 'binary' && encoded !== null) {
    let text = '';
    for (const byte of encoded as Uint8Array) text += String.fromCharCode(byte);
    return btoa(text);
  }
  return encoded !== null && (column.type === 'date' || column.type === 'timestamp')
    ? (encoded as { v: string }).v
    : encoded;
}
