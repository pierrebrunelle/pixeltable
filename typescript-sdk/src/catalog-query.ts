import { columnClasses, columnValue, copySchema } from './catalog-schema.js';
import type { CatalogColumn, CatalogRow, CatalogSchema, WritableColumn } from './catalog-schema.js';

type Wire = Record<string, unknown>;
type OrderedValue<T> = Exclude<T, null> extends string | number ? Exclude<T, null> : never;
type ColumnName<S extends CatalogSchema> = keyof S & string;
type SortableName<S extends CatalogSchema> = {
  [K in ColumnName<S>]: S[K]['type'] extends 'json' ? never : K;
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

class ColumnExpression<T> {
  declare readonly [expressionValue]: T;
  constructor(
    private readonly tableId: string,
    private readonly column: CatalogColumn,
    private readonly expression: Wire,
  ) {}
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
        table_version_key: { id: this.tableId, effective_version: null },
        qcol_id: { tbl_id: this.expression.col_tbl_id, col_id: this.expression.col_id },
        components: [{ _classname: 'Literal', val: query, col_type: { _classname: 'StringType', nullable: false } }],
      },
    );
  }
  computedDefinition(tableId: string): { column: CatalogColumn; wire: Wire } {
    if (tableId !== this.tableId) throw new TypeError('A computed expression must belong to the table');
    return {
      column: { type: this.column.type, nullable: this.column.nullable ?? false, computed: true },
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
    const literalValue = columnValue(value, numeric ? { type: 'float' } : { ...this.column, nullable: false }, true);
    const type = numeric ? (Number.isInteger(value) ? 'int' : 'float') : this.column.type;
    return {
      column: { type, nullable: false },
      expression: {
        _classname: 'Literal',
        val: literalValue,
        col_type: { _classname: columnClasses[type], nullable: false },
      },
    };
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
    if (![2, 3].includes(operator) && !['int', 'float', 'string'].includes(this.column.type))
      throw new TypeError('Ordering comparisons require numeric or string columns');
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
export type ComputedSchema<N extends string, T> = Record<
  N,
  {
    type: Exclude<T, null> extends number
      ? 'int' | 'float'
      : Exclude<T, null> extends string
        ? 'string'
        : Exclude<T, null> extends boolean
          ? 'bool'
          : 'json';
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
  const typeWire = (column: CatalogColumn): Wire => ({
    _classname: columnClasses[column.type],
    nullable: column.nullable ?? false,
  });
  const components = names.map((name) => {
    const value = args[name];
    const column = definition.parameters[name]!;
    if (value instanceof ColumnExpression) return value.toUpdateWire(tableId, column).v;
    return { _classname: 'Literal', val: columnValue(value, column, true), col_type: typeWire(column) };
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

export type CatalogProjection<E extends Record<string, CatalogExpression<unknown>>> = {
  [K in keyof E & string]: E[K] extends CatalogExpression<infer T> ? T : never;
};

export interface CatalogQuery<S extends CatalogSchema, R = CatalogRow<S>> {
  where(predicate: CatalogPredicate): CatalogQuery<S, R>;
  select<const C extends readonly ColumnName<S>[]>(...columns: C): CatalogQuery<S, Pick<CatalogRow<S>, C[number]>>;
  selectExpressions<const E extends Record<string, CatalogExpression<unknown>>>(
    expressions: E,
  ): CatalogQuery<S, CatalogProjection<E>>;
  orderBy(
    column: SortableName<S> | CatalogExpression<string | number | boolean | null>,
    direction?: 'asc' | 'desc',
  ): CatalogQuery<S, R>;
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
): { columns: CatalogColumns<S>; query: () => CatalogQuery<S> } {
  const references = Object.fromEntries(
    Object.entries(columnIds).map(([name, id]) => [
      name,
      {
        _classname: 'ColumnRef',
        tbl_id: tableId,
        effective_version: null,
        col_tbl_id: typeof id === 'number' ? tableId : id.tableId,
        col_tbl_effective_version: null,
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
    return names.map((name) => ({ name, expression: columnReference(name), alias: null, column: schema[name]! }));
  }
  function build<R>(
    selected: readonly Selection[],
    predicate: Predicate | null = null,
    order: readonly unknown[] = [],
    limit: Wire | null = null,
    offset: Wire | null = null,
  ): CatalogQuery<S, R> {
    function wire(): Wire {
      return {
        _classname: 'Query',
        from_clause: {
          tbls: [pathKey],
          join_clauses: [],
        },
        select_list: selected.map(({ expression, alias }) => [expression, alias]),
        where_clause: predicate?.toWire(tableId) ?? null,
        group_by_clause: null,
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
        return build<R>(selected, predicate ? predicate.and(next) : next, order, limit, offset);
      },
      select(...names) {
        if (names.length === 0 || new Set(names).size !== names.length)
          throw new TypeError('Select distinct column names');
        names.forEach(columnReference);
        return build(namedSelections(names), predicate, order, limit, offset);
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
        return build(projected, predicate, order, limit, offset);
      },
      orderBy(name, direction = 'asc') {
        if (direction !== 'asc' && direction !== 'desc') throw new TypeError('Invalid sort direction');
        const definition = name instanceof ColumnExpression ? name.computedDefinition(tableId) : null;
        const reference = definition ? definition.wire.v : columnReference(name as string);
        const column = definition ? definition.column : schema[name as string]!;
        if (column.type === 'json') throw new TypeError('JSON columns cannot be sorted');
        return build<R>(selected, predicate, [...order, [reference, direction === 'asc']], limit, offset);
      },
      limit(value) {
        return build<R>(selected, predicate, order, integerLiteral(value), offset);
      },
      offset(value) {
        return build<R>(selected, predicate, order, limit, integerLiteral(value));
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
