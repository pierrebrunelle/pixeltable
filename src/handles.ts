export interface QueryReference {
  readonly key: readonly unknown[];
}

export interface QueryHandle<Input, Output> extends QueryReference {
  run(input: Input, options?: { signal?: AbortSignal }): Promise<Output>;
}

export function defineQuery<Input, Output>(
  key: readonly unknown[],
  run: QueryHandle<Input, Output>['run'],
): QueryHandle<Input, Output> {
  if (key.length === 0) throw new TypeError('A query key must identify the service, scope, and query');
  return Object.freeze({ key: Object.freeze([...key]), run });
}
