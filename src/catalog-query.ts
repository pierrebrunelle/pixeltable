import { columnClasses, columnValue } from './catalog-schema.js';
import type { CatalogColumn, CatalogRow, CatalogSchema } from './catalog-schema.js';

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
export type CatalogColumns<S extends CatalogSchema> = {
  readonly [K in keyof S & string]: ColumnExpression<CatalogRow<S>[K]>;
};

export type CatalogUpdateRow<S extends CatalogSchema> = {
  [K in keyof S & string]?: CatalogRow<S>[K] | ColumnExpression<CatalogRow<S>[K]>;
};

export function updateValue(value: unknown, column: CatalogColumn, tableId: string): unknown {
  return value instanceof ColumnExpression ? value.toUpdateWire(tableId, column) : columnValue(value, column, true);
}

export interface CatalogQuery<S extends CatalogSchema, K extends ColumnName<S> = ColumnName<S>> {
  where(predicate: CatalogPredicate): CatalogQuery<S, K>;
  select<const C extends readonly ColumnName<S>[]>(...columns: C): CatalogQuery<S, C[number]>;
  orderBy(column: SortableName<S>, direction?: 'asc' | 'desc'): CatalogQuery<S, K>;
  limit(value: number): CatalogQuery<S, K>;
  offset(value: number): CatalogQuery<S, K>;
  collect(options?: { signal?: AbortSignal }): Promise<Pick<CatalogRow<S>, K>[]>;
  count(options?: { signal?: AbortSignal }): Promise<number>;
}

export function createTableQueries<S extends CatalogSchema>(
  tableId: string,
  schema: S,
  columnIds: Record<string, number>,
  collect: (query: Wire, columns: readonly string[], signal?: AbortSignal) => Promise<CatalogRow<S>[]>,
  count: (query: Wire, signal?: AbortSignal) => Promise<number>,
): { columns: CatalogColumns<S>; query: () => CatalogQuery<S> } {
  const references = Object.fromEntries(
    Object.entries(columnIds).map(([name, id]) => [
      name,
      {
        _classname: 'ColumnRef',
        tbl_id: tableId,
        effective_version: null,
        col_tbl_id: tableId,
        col_tbl_effective_version: null,
        col_id: id,
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
  function build<K extends ColumnName<S>>(
    selected: readonly K[],
    predicate: Predicate | null = null,
    order: readonly unknown[] = [],
    limit: Wire | null = null,
    offset: Wire | null = null,
  ): CatalogQuery<S, K> {
    function wire(): Wire {
      return {
        _classname: 'Query',
        from_clause: {
          tbls: [{ tbl_version: { id: tableId, effective_version: null }, base: null }],
          join_clauses: [],
        },
        select_list: selected.map((name) => [columnReference(name), null]),
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
        return build(selected, predicate ? predicate.and(next) : next, order, limit, offset);
      },
      select(...names) {
        if (names.length === 0 || new Set(names).size !== names.length)
          throw new TypeError('Select distinct column names');
        names.forEach(columnReference);
        return build(names, predicate, order, limit, offset);
      },
      orderBy(name, direction = 'asc') {
        if (direction !== 'asc' && direction !== 'desc') throw new TypeError('Invalid sort direction');
        const reference = columnReference(name);
        if (schema[name]!.type === 'json') throw new TypeError('JSON columns cannot be sorted');
        return build(selected, predicate, [...order, [reference, direction === 'asc']], limit, offset);
      },
      limit(value) {
        return build(selected, predicate, order, integerLiteral(value), offset);
      },
      offset(value) {
        return build(selected, predicate, order, limit, integerLiteral(value));
      },
      async collect(options = {}) {
        return collect(wire(), selected, options.signal);
      },
      async count(options = {}) {
        if (limit !== null || offset !== null) throw new TypeError('count() cannot be used with limit() or offset()');
        return count(wire(), options.signal);
      },
    };
  }
  return { columns, query: () => build(Object.keys(schema) as ColumnName<S>[]) };
}
