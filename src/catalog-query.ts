import type { CatalogArray } from './catalog-array.js';
import type { CatalogUuid } from './catalog-uuid.js';
import type { CatalogDate, CatalogTimestamp } from './catalog-temporal.js';
import { columnClasses, columnValue, copySchema, literalValue, columnWire } from './catalog-schema.js';
import type { CatalogColumn, CatalogRow, CatalogSchema, WritableColumn, JsonValue } from './catalog-schema.js';

type Wire = Record<string, unknown>;
type OrderedValue<T> = Exclude<T, null> extends string | number ? Exclude<T, null> : never;
type ColumnName<S extends CatalogSchema> = keyof S & string;
type SortableName<S extends CatalogSchema> = {
  [K in ColumnName<S>]: S[K]['type'] extends 'json' | 'binary' | 'array' ? never : K;
}[ColumnName<S>];

class Predicate {
  constructor(
    private readonly tableId: string,
    private readonly expression: Wire,
  ) {}
  toWire(tableId: string): Wire {
    if (tableId !== this.tableId) throw new TypeError('A predicate must belong to the queried table');
    return this.expression;
  }
  and(other: Predicate): Predicate {
    return this.combine(0, other);
  }
  or(other: Predicate): Predicate {
    return this.combine(1, other);
  }
  not(): Predicate {
    return new Predicate(this.tableId, { _classname: 'CompoundPredicate', operator: 2, components: [this.expression] });
  }
  private combine(operator: number, other: Predicate): Predicate {
    return new Predicate(this.tableId, {
      _classname: 'CompoundPredicate',
      operator,
      components: [this.expression, other.toWire(this.tableId)],
    });
  }
}
export type CatalogPredicate = Predicate;

declare const expressionValue: unique symbol;

type NumericOperand<T> = Exclude<T, null> extends number ? number | ColumnExpression<number | null> : never;
type ArithmeticValue<T, O> =
  number | Extract<T, null> | (O extends ColumnExpression<infer V> ? Extract<V, null> : never);

export interface CatalogArraySlice {
  start?: number;
  stop?: number;
  step?: number;
}

export type CatalogJsonPathElement = string | number | { start?: number; stop?: number; step?: number };
export type CatalogCastType = Pick<CatalogColumn, 'type' | 'nullable' | 'dtype' | 'shape'>;
export type CatalogWindow =
  | { partitionBy: ProjectionExpression; orderBy?: ProjectionExpression }
  | { partitionBy?: ProjectionExpression; orderBy: ProjectionExpression };

class ColumnExpression<T> {
  declare readonly [expressionValue]: T;
  constructor(
    private readonly tableId: string,
    private readonly column: CatalogColumn,
    private readonly expression: Wire,
  ) {}
  arrayElement(
    ...indices: Exclude<T, null> extends CatalogArray ? number[] : never
  ): ColumnExpression<number | boolean | Extract<T, null>> {
    if (this.column.type !== 'array' || !this.column.dtype || !this.column.shape)
      throw new TypeError('Array elements require a declared dtype and shape');
    if (indices.length !== this.column.shape.length)
      throw new TypeError('Specify one integer index for every array dimension');
    indices.forEach((index, axis) => {
      if (!Number.isSafeInteger(index)) throw new TypeError('Array indices must be safe integers');
      const dimension = this.column.shape![axis];
      if (dimension !== null && dimension !== undefined && (index < -dimension || index >= dimension))
        throw new TypeError('Array index is out of bounds');
    });
    const type = this.column.dtype === 'bool' ? 'bool' : this.column.dtype.startsWith('float') ? 'float' : 'int';
    return new ColumnExpression(
      this.tableId,
      { type, nullable: this.column.nullable ?? false },
      {
        _classname: 'ArraySlice',
        index: [...indices],
        components: [this.expression],
      },
    );
  }
  arraySlice(
    ...slices: Exclude<T, null> extends CatalogArray ? (CatalogArraySlice | number)[] : never
  ): ColumnExpression<CatalogArray | Extract<T, null>> {
    if (this.column.type !== 'array') throw new TypeError('Array slicing requires an array expression');
    if (!slices.length) throw new TypeError('Specify at least one array slice');
    if (this.column.shape && slices.length > this.column.shape.length) throw new TypeError('Too many array slices');
    const index = slices.map((slice, axis) => {
      if (typeof slice === 'number') {
        if (!this.column.shape) throw new TypeError('Integer array indices require a declared shape');
        if (!Number.isSafeInteger(slice)) throw new TypeError('Array indices must be safe integers');
        const dimension = this.column.shape[axis];
        if (dimension !== null && dimension !== undefined && (slice < -dimension || slice >= dimension))
          throw new TypeError('Array index is out of bounds');
        return slice;
      }
      if (
        typeof slice !== 'object' ||
        slice === null ||
        Array.isArray(slice) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(slice)) ||
        Object.keys(slice).some((key) => !['start', 'stop', 'step'].includes(key))
      )
        throw new TypeError('Array slices require start, stop, and step options');
      const values = [slice.start, slice.stop, slice.step];
      if (values.some((value) => value !== undefined && !Number.isSafeInteger(value)) || slice.step === 0)
        throw new TypeError('Array slice bounds must be safe integers and step cannot be zero');
      return values.map((value) => value ?? null);
    });
    if (
      this.column.shape &&
      index.length === this.column.shape.length &&
      index.every((part) => typeof part === 'number')
    )
      throw new TypeError('Use arrayElement to select a scalar; arraySlice must retain at least one dimension');
    const shape = this.column.shape
      ?.map((dimension, axis) => {
        const slice = index[axis];
        if (typeof slice === 'number') return undefined;
        if (dimension === null || !slice) return dimension;
        const size = BigInt(dimension);
        const step = BigInt(slice[2] ?? 1);
        const positive = step > 0n;
        const bound = (value: number | null | undefined, fallback: bigint): bigint => {
          if (value === null || value === undefined) return fallback;
          let result = BigInt(value);
          if (result < 0n) result += size;
          const lower = positive ? 0n : -1n;
          const upper = positive ? size : size - 1n;
          return result < lower ? lower : result > upper ? upper : result;
        };
        const start = bound(slice[0], positive ? 0n : size - 1n);
        const stop = bound(slice[1], positive ? size : -1n);
        const distance = positive ? stop - start : start - stop;
        const stride = positive ? step : -step;
        return distance <= 0n ? 0 : Number((distance + stride - 1n) / stride);
      })
      .filter((dimension) => dimension !== undefined);
    return new ColumnExpression(
      this.tableId,
      { ...this.column, ...(shape ? { shape } : {}) },
      {
        _classname: 'ArraySlice',
        index,
        components: [this.expression],
      },
    );
  }
  jsonPath(...path: JsonValue extends T | null ? CatalogJsonPathElement[] : never): ColumnExpression<JsonValue> {
    if (this.column.type !== 'json') throw new TypeError('JSON paths require a JSON expression');
    if (path.length === 0) throw new TypeError('A JSON path requires at least one element');
    const elements = Array.from(path, (element) => {
      if (typeof element === 'string') return element;
      if (typeof element === 'number' && Number.isSafeInteger(element)) return element;
      if (
        typeof element !== 'object' ||
        element === null ||
        Array.isArray(element) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(element))
      )
        throw new TypeError('JSON path elements must be keys, integer indices, or slices');
      if (Object.keys(element).some((key) => !['start', 'stop', 'step'].includes(key)))
        throw new TypeError('Unsupported JSON slice option');
      const values = [element.start, element.stop, element.step];
      if (values.some((value) => value !== undefined && !Number.isSafeInteger(value)) || element.step === 0)
        throw new TypeError('JSON slice bounds must be safe integers and step cannot be zero');
      return values.map((value) => value ?? null);
    });
    const isPath = this.expression._classname === 'JsonPath';
    return new ColumnExpression(
      this.tableId,
      { type: 'json', nullable: true },
      {
        _classname: 'JsonPath',
        path_elements: [...(isPath ? (this.expression.path_elements as unknown[]) : []), ...elements],
        root_type: null,
        components: isPath ? this.expression.components : [this.expression],
      },
    );
  }
  asType<const C extends CatalogCastType>(
    target: C,
  ): ColumnExpression<
    null extends T ? CatalogRow<{ result: C }>['result'] : Exclude<CatalogRow<{ result: C }>['result'], null>
  > {
    if (Object.keys(target).some((key) => !['type', 'nullable', 'dtype', 'shape'].includes(key)))
      throw new TypeError('Cast types only accept type, nullable, dtype, and shape');
    const column = copySchema({ result: target }).result;
    const result = { ...column, nullable: Boolean(this.column.nullable && column.nullable) };
    return new ColumnExpression(this.tableId, result, {
      _classname: 'TypeCast',
      new_type: columnWire(result),
      components: [this.expression],
    });
  }
  aggregate<
    K extends
      | 'count'
      | (Exclude<T, null> extends number ? 'sum' | 'mean' : never)
      | (Exclude<T, null> extends CatalogDate | CatalogUuid
          ? never
          : Exclude<T, null> extends string | number | boolean
            ? 'min' | 'max'
            : never),
  >(
    kind: K,
    window?: NoInfer<K> extends 'mean' ? never : CatalogWindow,
  ): ColumnExpression<K extends 'count' ? number : K extends 'sum' | 'mean' ? number | null : T | null> {
    if (!['count', 'sum', 'mean', 'min', 'max'].includes(kind)) throw new TypeError('Unsupported aggregate');
    if (['sum', 'mean'].includes(kind) && !['int', 'float'].includes(this.column.type))
      throw new TypeError('Sum and mean require numeric expressions');
    if (['min', 'max'].includes(kind) && ['json', 'date', 'binary', 'uuid', 'array'].includes(this.column.type))
      throw new TypeError('Min and max require ordered scalar expressions');
    if (
      window !== undefined &&
      (kind === 'mean' ||
        typeof window !== 'object' ||
        window === null ||
        Object.keys(window).some((key) => !['partitionBy', 'orderBy'].includes(key)) ||
        (window.partitionBy === undefined && window.orderBy === undefined))
    )
      throw new TypeError('A window requires partitionBy or orderBy and is not supported by mean');
    const windowExpression = (value: ProjectionExpression | undefined): Wire[] => {
      if (value === undefined) return [];
      if (!(value instanceof ColumnExpression)) throw new TypeError('Window keys must be catalog expressions');
      return [value.computedDefinition(this.tableId).wire.v as Wire];
    };
    const partitions = windowExpression(window?.partitionBy);
    const ordering = windowExpression(window?.orderBy);
    const column: CatalogColumn = {
      type: kind === 'count' ? 'int' : kind === 'mean' ? 'float' : this.column.type,
      nullable: kind !== 'count',
    };
    return new ColumnExpression(this.tableId, column, {
      _classname: 'FunctionCall',
      fn: {
        _classpath: 'pixeltable.func.aggregate_function.AggregateFunction',
        path: `pixeltable.functions.globals.${kind}`,
        signatures: [
          {
            return_type: { _classname: columnClasses[column.type], nullable: column.nullable },
            parameters: [
              {
                name: 'val',
                col_type: columnWire({ ...this.column, nullable: true }),
                kind: 'POSITIONAL_OR_KEYWORD',
                is_batched: false,
                default: null,
              },
            ],
            is_batched: false,
          },
        ],
      },
      return_type: { _classname: columnClasses[column.type], nullable: column.nullable },
      arg_idxs: [0],
      kwarg_idxs: {},
      group_by_start_idx: partitions.length ? 1 : 0,
      group_by_stop_idx: partitions.length ? 2 : 0,
      order_by_start_idx: 1 + partitions.length,
      is_method_call: false,
      components: [this.expression, ...partitions, ...ordering],
    });
  }
  get errorType(): ColumnExpression<string | null> {
    return this.errorProperty(0);
  }
  get errorMessage(): ColumnExpression<string | null> {
    return this.errorProperty(1);
  }
  private errorProperty(prop: number): ColumnExpression<string | null> {
    if (!this.column.computed || this.expression._classname !== 'ColumnRef')
      throw new TypeError('Error properties require a stored computed column');
    return new ColumnExpression(
      this.tableId,
      { type: 'string', nullable: true },
      {
        _classname: 'ColumnPropertyRef',
        prop,
        components: [this.expression],
      },
    );
  }
  similarity(query: Exclude<T, null> extends string ? string : never, indexName?: string): ColumnExpression<number> {
    if (this.column.type !== 'string' || this.expression._classname !== 'ColumnRef')
      throw new TypeError('Similarity requires a string column reference');
    if (typeof query !== 'string') throw new TypeError('Similarity requires a string query');
    if (indexName !== undefined && (typeof indexName !== 'string' || !indexName))
      throw new TypeError('An index name must be a nonempty string');
    return new ColumnExpression(
      this.tableId,
      { type: 'float' },
      {
        _classname: 'SimilarityExpr',
        idx_name: indexName ?? null,
        table_version_key: { id: this.expression.tbl_id, effective_version: this.expression.effective_version },
        qcol_id: { tbl_id: this.expression.col_tbl_id, col_id: this.expression.col_id },
        components: [{ _classname: 'Literal', val: query, col_type: { _classname: 'StringType', nullable: false } }],
      },
    );
  }
  computedDefinition(tableId: string): { column: CatalogColumn; wire: Wire } {
    if (tableId !== this.tableId) throw new TypeError('A computed expression must belong to the table');
    return {
      column: {
        type: this.column.type,
        nullable: this.column.nullable ?? false,
        computed: true,
        ...(this.column.type === 'array'
          ? {
              ...(this.column.dtype ? { dtype: this.column.dtype } : {}),
              ...(this.column.shape ? { shape: this.column.shape } : {}),
            }
          : {}),
      },
      wire: { $pxt: 'Expr', v: this.expression },
    };
  }
  toUpdateWire(tableId: string, target: CatalogColumn): Wire {
    if (tableId !== this.tableId) throw new TypeError('An expression must belong to the updated table');
    if (
      (this.column.type !== target.type && !(this.column.type === 'int' && target.type === 'float')) ||
      (this.column.nullable && !target.nullable)
    )
      throw new TypeError('Update expression type does not match the target column');
    return { $pxt: 'Expr', v: this.expression };
  }
  add<O extends NumericOperand<T>>(value: O): ColumnExpression<ArithmeticValue<T, O>> {
    return this.arithmetic(0, value);
  }
  subtract<O extends NumericOperand<T>>(value: O): ColumnExpression<ArithmeticValue<T, O>> {
    return this.arithmetic(1, value);
  }
  multiply<O extends NumericOperand<T>>(value: O): ColumnExpression<ArithmeticValue<T, O>> {
    return this.arithmetic(2, value);
  }
  divide<O extends NumericOperand<T>>(value: O): ColumnExpression<ArithmeticValue<T, O>> {
    return this.arithmetic(3, value);
  }
  modulo<O extends NumericOperand<T>>(value: O): ColumnExpression<ArithmeticValue<T, O>> {
    return this.arithmetic(4, value);
  }
  floorDivide<O extends NumericOperand<T>>(value: O): ColumnExpression<ArithmeticValue<T, O>> {
    return this.arithmetic(5, value);
  }
  pow<O extends NumericOperand<T>>(value: O): ColumnExpression<ArithmeticValue<T, O>> {
    return this.arithmetic(6, value);
  }
  private arithmetic<O extends number | ColumnExpression<number | null>>(
    operator: number,
    value: O,
  ): ColumnExpression<ArithmeticValue<T, O>> {
    if (!['int', 'float'].includes(this.column.type)) throw new TypeError('Arithmetic requires numeric columns');
    const operand = this.operand(value);
    if (!['int', 'float'].includes(operand.column.type)) throw new TypeError('Arithmetic requires numeric operands');
    const type =
      this.column.type === 'float' ||
      operand.column.type === 'float' ||
      operator === 3 ||
      (operator === 6 && !(typeof value === 'number' && Number.isInteger(value) && value >= 0))
        ? 'float'
        : 'int';
    return new ColumnExpression(
      this.tableId,
      {
        type,
        nullable: Boolean(this.column.nullable || operand.column.nullable),
      },
      { _classname: 'ArithmeticExpr', operator, components: [this.expression, operand.expression] },
    );
  }
  private operand(value: unknown): { column: CatalogColumn; expression: Wire } {
    if (value instanceof ColumnExpression) {
      if (value.tableId !== this.tableId) throw new TypeError('Operands must belong to the same table');
      return { column: value.column, expression: value.expression };
    }
    const numeric = this.column.type === 'int' || this.column.type === 'float';
    const encodedValue = literalValue(value, numeric ? { type: 'float' } : { ...this.column, nullable: false });
    const type = numeric ? (Number.isInteger(value) ? 'int' : 'float') : this.column.type;
    return {
      column: { type, nullable: false },
      expression: {
        _classname: 'Literal',
        val: encodedValue,
        col_type: { _classname: columnClasses[type], nullable: false },
      },
    };
  }
  isIn(
    values: Exclude<T, null> extends string | number | boolean ? readonly T[] | ColumnExpression<JsonValue> : never,
  ): Predicate {
    if (['json', 'binary', 'array'].includes(this.column.type))
      throw new TypeError('Membership requires a scalar expression');
    if (values instanceof ColumnExpression) {
      if (values.tableId !== this.tableId || values.column.type !== 'json')
        throw new TypeError('Membership values must be a JSON expression from the same table');
      return new Predicate(this.tableId, {
        _classname: 'InPredicate',
        value_list: null,
        components: [this.expression, values.expression],
      });
    }
    if (!Array.isArray(values)) throw new TypeError('Membership requires an array or JSON expression');
    const validated = Array.from(values, (value) => columnValue(value, this.column, true));
    const integralFloats =
      this.column.type === 'float'
        ? validated.filter((value) => typeof value === 'number' && Number.isInteger(value))
        : [];
    let predicate = new Predicate(this.tableId, {
      _classname: 'InPredicate',
      value_list: validated.filter((value) => !integralFloats.includes(value)),
      components: [this.expression],
    });
    // JSON encodes 3.0 as 3; Python's IN normalization would discard that integer for a float column.
    for (const value of integralFloats) predicate = predicate.or(this.compare(2, value));
    return predicate;
  }
  eq(value: T | ColumnExpression<T | null>): Predicate {
    return value === null ? this.isNull() : this.compare(2, value);
  }
  ne(value: T | ColumnExpression<T | null>): Predicate {
    return value === null ? this.isNull().not() : this.compare(3, value);
  }
  lt(value: OrderedValue<T> | ColumnExpression<OrderedValue<T> | null>): Predicate {
    return this.compare(0, value);
  }
  lte(value: OrderedValue<T> | ColumnExpression<OrderedValue<T> | null>): Predicate {
    return this.compare(1, value);
  }
  gt(value: OrderedValue<T> | ColumnExpression<OrderedValue<T> | null>): Predicate {
    return this.compare(4, value);
  }
  gte(value: OrderedValue<T> | ColumnExpression<OrderedValue<T> | null>): Predicate {
    return this.compare(5, value);
  }
  isNull(): Predicate {
    return new Predicate(this.tableId, { _classname: 'IsNull', components: [this.expression] });
  }
  private compare(operator: number, value: unknown): Predicate {
    if (value === null) throw new TypeError('Use isNull() to test for null');
    if (this.column.type === 'array') throw new TypeError('Array comparisons are not supported');
    if (
      ![2, 3].includes(operator) &&
      !['int', 'float', 'string', 'date', 'timestamp', 'uuid'].includes(this.column.type)
    )
      throw new TypeError('Ordering comparisons require numeric, string, date, timestamp, or UUID columns');
    const operand = this.operand(value);
    const numeric = ['int', 'float'].includes(this.column.type) && ['int', 'float'].includes(operand.column.type);
    if (this.column.type !== operand.column.type && !numeric)
      throw new TypeError('Comparison operand types must match');
    return new Predicate(this.tableId, {
      _classname: 'Comparison',
      operator,
      components: [this.expression, operand.expression],
    });
  }
}
export type CatalogExpression<T> = ColumnExpression<T>;
type ComputedValueType<T> = T extends CatalogArray
  ? 'array'
  : T extends CatalogUuid
    ? 'uuid'
    : T extends Uint8Array
      ? 'binary'
      : T extends CatalogDate
        ? 'date'
        : T extends CatalogTimestamp
          ? 'timestamp'
          : T extends number
            ? 'int' | 'float'
            : T extends string
              ? 'string'
              : T extends boolean
                ? 'bool'
                : 'json';
export type ComputedSchema<N extends string, T> = Record<
  N,
  {
    type: ComputedValueType<Exclude<T, null>>;
    nullable: null extends T ? true : false;
    computed: true;
  }
>;

export type CatalogColumns<S extends CatalogSchema> = {
  readonly [K in keyof S & string]: ColumnExpression<CatalogRow<S>[K]>;
};

export type CatalogUpdateRow<S extends CatalogSchema> = {
  [K in WritableColumn<S>]?: CatalogRow<S>[K] | ColumnExpression<CatalogRow<S>[K]>;
};

export function updateValue(value: unknown, column: CatalogColumn, tableId: string): unknown {
  return value instanceof ColumnExpression ? value.toUpdateWire(tableId, column) : columnValue(value, column, true);
}

export interface CatalogFunction<P extends CatalogSchema, C extends CatalogColumn> {
  readonly path: string;
  readonly parameters: P;
  readonly returns: C;
}
export type CatalogFunctionArgs<P extends CatalogSchema> = {
  [K in keyof P & string]: CatalogRow<P>[K] | CatalogExpression<CatalogRow<P>[K]>;
};
export function defineCatalogFunction<const P extends CatalogSchema, const C extends CatalogColumn>(
  path: string,
  parameters: P,
  returns: C,
): CatalogFunction<P, C> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(path))
    throw new TypeError('A Python function import path is required');
  const copied = Object.keys(parameters).length ? copySchema(parameters) : Object.freeze({ ...parameters });
  const result = copySchema({ result: returns }).result;
  for (const column of [...Object.values(copied), result])
    if (column.computed || column.primaryKey) throw new TypeError('Function types cannot be computed or primary keys');
  return Object.freeze({ path, parameters: copied, returns: result });
}
export function callCatalogFunction<P extends CatalogSchema, C extends CatalogColumn>(
  tableId: string,
  fn: CatalogFunction<P, C>,
  args: CatalogFunctionArgs<P>,
): CatalogExpression<CatalogRow<{ result: C }>['result']> {
  const definition = defineCatalogFunction(fn.path, fn.parameters, fn.returns);
  if (typeof args !== 'object' || args === null || Array.isArray(args))
    throw new TypeError('Expected named function arguments');
  const names = Object.keys(definition.parameters);
  if (Object.keys(args).length !== names.length || names.some((name) => !Object.hasOwn(args, name)))
    throw new TypeError('Function arguments must match the declared parameters');
  const typeWire = columnWire;
  const components = names.map((name) => {
    const value = args[name];
    const column = definition.parameters[name]!;
    if (value instanceof ColumnExpression) return value.toUpdateWire(tableId, column).v;
    return { _classname: 'Literal', val: literalValue(value, column), col_type: typeWire(column) };
  });
  const returnType = typeWire(definition.returns);
  return new ColumnExpression(tableId, definition.returns, {
    _classname: 'FunctionCall',
    fn: {
      _classpath: 'pixeltable.func.callable_function.CallableFunction',
      path: definition.path,
      signatures: [
        {
          return_type: returnType,
          is_batched: false,
          parameters: names.map((name) => ({
            name,
            col_type: typeWire(definition.parameters[name]!),
            kind: 'POSITIONAL_OR_KEYWORD',
            is_batched: false,
            default: null,
          })),
        },
      ],
    },
    return_type: returnType,
    arg_idxs: [],
    kwarg_idxs: Object.fromEntries(names.map((name, index) => [name, index])),
    group_by_start_idx: 0,
    group_by_stop_idx: 0,
    order_by_start_idx: components.length,
    is_method_call: false,
    components,
  });
}

type ProjectionExpression = { readonly [expressionValue]: unknown };
export type CatalogProjection<E extends Record<string, ProjectionExpression>> = {
  [K in keyof E & string]: E[K][typeof expressionValue];
};

export interface CatalogQuery<S extends CatalogSchema, R = CatalogRow<S>> {
  where(predicate: CatalogPredicate): CatalogQuery<S, R>;
  select<const C extends readonly ColumnName<S>[]>(...columns: C): CatalogQuery<S, Pick<CatalogRow<S>, C[number]>>;
  selectExpressions<const E extends Record<string, ProjectionExpression>>(
    expressions: E,
  ): CatalogQuery<S, CatalogProjection<E>>;
  orderBy(
    column: SortableName<S> | CatalogExpression<string | number | boolean | null>,
    direction?: 'asc' | 'desc',
  ): CatalogQuery<S, R>;
  distinct(): CatalogQuery<S, R>;
  groupBy(...columns: (ColumnName<S> | ProjectionExpression)[]): CatalogQuery<S, R>;
  limit(value: number): CatalogQuery<S, R>;
  offset(value: number): CatalogQuery<S, R>;
  collect(options?: { signal?: AbortSignal }): Promise<R[]>;
  count(options?: { signal?: AbortSignal }): Promise<number>;
}

export function createTableQueries<S extends CatalogSchema>(
  tableId: string,
  schema: S,
  columnIds: Record<string, number | { id: number; tableId: string }>,
  collect: (
    query: Wire,
    columns: readonly string[],
    signal?: AbortSignal,
    outputSchema?: CatalogSchema,
  ) => Promise<Record<string, unknown>[]>,
  count: (query: Wire, signal?: AbortSignal) => Promise<number>,
  pathKey: Wire = { tbl_version: { id: tableId, effective_version: null }, base: null },
  joined?: { references: Record<string, Wire>; fromClause: Wire },
): { columns: CatalogColumns<S>; query: () => CatalogQuery<S> } {
  const queryVersion = pathKey.tbl_version as { id: string; effective_version: number | null };
  const ownerVersions = new Map<string, number | null>();
  let current: Wire | null = pathKey;
  while (current) {
    const version = current.tbl_version as { id: string; effective_version: number | null };
    ownerVersions.set(version.id, version.effective_version);
    current = current.base as Wire | null;
  }
  const references =
    joined?.references ??
    Object.fromEntries(
      Object.entries(columnIds).map(([name, id]) => [
        name,
        {
          _classname: 'ColumnRef',
          tbl_id: queryVersion.id,
          effective_version: queryVersion.effective_version,
          col_tbl_id: typeof id === 'number' ? tableId : id.tableId,
          col_tbl_effective_version: ownerVersions.get(typeof id === 'number' ? tableId : id.tableId) ?? null,
          col_id: typeof id === 'number' ? id : id.id,
          perform_validation: false,
        },
      ]),
    );
  function columnReference(name: string): Wire {
    if (!Object.hasOwn(references, name)) throw new TypeError(`Unknown query column: ${name}`);
    return references[name]!;
  }
  const columns = Object.freeze(
    Object.fromEntries(
      Object.entries(schema).map(([name, column]) => [
        name,
        new ColumnExpression(tableId, column, columnReference(name)),
      ]),
    ),
  ) as CatalogColumns<S>;
  function integerLiteral(value: number): Wire {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new TypeError('Query limits and offsets must be nonnegative safe integers');
    return { _classname: 'Literal', val: value, col_type: { _classname: 'IntType', nullable: false } };
  }
  type Selection = { name: string; expression: Wire; alias: string | null; column: CatalogColumn };
  function namedSelections(names: readonly string[]): Selection[] {
    return names.map((name) => ({
      name,
      expression: columnReference(name),
      alias: joined ? name : null,
      column: schema[name]!,
    }));
  }
  function build<R>(
    selected: readonly Selection[],
    predicate: Predicate | null = null,
    order: readonly unknown[] = [],
    limit: Wire | null = null,
    offset: Wire | null = null,
    grouping: readonly Wire[] | null = null,
  ): CatalogQuery<S, R> {
    function wire(): Wire {
      return {
        _classname: 'Query',
        from_clause: joined?.fromClause ?? {
          tbls: [pathKey],
          join_clauses: [],
        },
        select_list: selected.map(({ expression, alias }) => [expression, alias]),
        where_clause: predicate?.toWire(tableId) ?? null,
        group_by_clause: grouping,
        grouping_tbl: null,
        order_by_clause: order.length ? order : null,
        limit_val: limit,
        offset_val: offset,
        sample_clause: null,
      };
    }
    return {
      where(next) {
        if (!(next instanceof Predicate)) throw new TypeError('Expected a catalog predicate');
        next.toWire(tableId);
        return build<R>(selected, predicate ? predicate.and(next) : next, order, limit, offset, grouping);
      },
      select(...names) {
        if (names.length === 0 || new Set(names).size !== names.length)
          throw new TypeError('Select distinct column names');
        names.forEach(columnReference);
        return build(namedSelections(names), predicate, order, limit, offset, grouping);
      },
      selectExpressions(expressions) {
        const entries = Object.entries(expressions);
        if (entries.length === 0) throw new TypeError('Select at least one expression');
        const projected = entries.map(([name, expression]) => {
          if (!(expression instanceof ColumnExpression)) throw new TypeError('Expected a catalog expression');
          const definition = expression.computedDefinition(tableId);
          return { name, expression: definition.wire.v as Wire, alias: name, column: definition.column };
        });
        copySchema(Object.fromEntries(projected.map(({ name, column }) => [name, column])));
        return build(projected, predicate, order, limit, offset, grouping);
      },
      orderBy(name, direction = 'asc') {
        if (direction !== 'asc' && direction !== 'desc') throw new TypeError('Invalid sort direction');
        const definition = name instanceof ColumnExpression ? name.computedDefinition(tableId) : null;
        const reference = definition ? definition.wire.v : columnReference(name as string);
        const column = definition ? definition.column : schema[name as string]!;
        if (['json', 'binary', 'array'].includes(column.type))
          throw new TypeError('JSON, binary, and array columns cannot be sorted');
        return build<R>(selected, predicate, [...order, [reference, direction === 'asc']], limit, offset, grouping);
      },
      distinct() {
        if (grouping !== null) throw new TypeError('groupBy() is already specified');
        return build<R>(
          selected,
          predicate,
          order,
          limit,
          offset,
          selected.map(({ expression }) => expression),
        );
      },
      groupBy(...items) {
        if (grouping !== null) throw new TypeError('groupBy() is already specified');
        const expressions = items.map((item) => {
          if (typeof item === 'string') return columnReference(item);
          if (!(item instanceof ColumnExpression)) throw new TypeError('Expected a column name or catalog expression');
          return item.computedDefinition(tableId).wire.v as Wire;
        });
        return build<R>(selected, predicate, order, limit, offset, expressions);
      },
      limit(value) {
        return build<R>(selected, predicate, order, integerLiteral(value), offset, grouping);
      },
      offset(value) {
        return build<R>(selected, predicate, order, limit, integerLiteral(value), grouping);
      },
      async collect(options = {}) {
        return collect(
          wire(),
          selected.map(({ name }) => name),
          options.signal,
          Object.fromEntries(selected.map(({ name, column }) => [name, column])),
        ) as Promise<R[]>;
      },
      async count(options = {}) {
        if (limit !== null || offset !== null) throw new TypeError('count() cannot be used with limit() or offset()');
        return count(wire(), options.signal);
      },
    };
  }
  return { columns, query: () => build<CatalogRow<S>>(namedSelections(Object.keys(schema))) };
}
