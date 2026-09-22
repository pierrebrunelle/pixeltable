const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

export function clientSource(schema) {
  const names = new Set();
  const calls = [];
  let needsMultipart = false;
  for (const [path, item] of Object.entries(schema.paths ?? {})) {
    if (item.$ref) throw new Error(`Resolve the path reference at ${path} before generating a client`);
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      const name = operation.operationId;
      if (typeof name !== 'string' || !name || names.has(name)) {
        throw new Error(`A unique operationId is required for ${method.toUpperCase()} ${path}`);
      }
      names.add(name);
      const unsupported = () => {
        throw new Error(`Unsupported named call: ${name}. Generate declarations without --client and use client.api`);
      };
      if (method === 'head') unsupported();
      const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])];
      if (parameters.some((parameter) => parameter.$ref || parameter.in !== 'query') || path.includes('{')) {
        unsupported();
      }
      const body = operation.requestBody;
      const mediaTypes = Object.keys(body?.content ?? {});
      if (body && (body.$ref || !body.required || parameters.length || mediaTypes.length !== 1)) unsupported();
      const mediaType = mediaTypes[0];
      if (body && mediaType !== 'application/json' && mediaType !== 'multipart/form-data') unsupported();
      if (mediaType === 'multipart/form-data') {
        needsMultipart = true;
        const bodySchema = body.content[mediaType].schema;
        const resolveSchema = (value) => {
          if (!value?.$ref) return value;
          if (!value.$ref.startsWith('#/components/schemas/')) unsupported();
          return schema.components?.schemas?.[value.$ref.slice('#/components/schemas/'.length)];
        };
        const objectSchema = resolveSchema(bodySchema);
        if (objectSchema?.type !== 'object' || objectSchema.additionalProperties) unsupported();
        for (const field of Object.values(objectSchema.properties ?? {})) {
          const resolved = resolveSchema(field);
          const alternatives = resolved?.anyOf ?? [resolved];
          if (alternatives.some((value) => !['string', 'number', 'integer', 'boolean', 'null'].includes(value?.type)))
            unsupported();
        }
      }
      const success = Object.entries(operation.responses ?? {}).filter(([status]) => /^2/.test(status));
      if (
        success.length !== 1 ||
        success[0][0] !== '200' ||
        Object.keys(success[0][1].content ?? {}).join() !== 'application/json'
      )
        unsupported();
      const operationType = `operations[${JSON.stringify(name)}]`;
      const inputType = body
        ? `${operationType}['requestBody']['content'][${JSON.stringify(mediaType)}]`
        : parameters.length
          ? `NonNullable<${operationType}['parameters']['query']>`
          : 'Record<string, never>';
      const optionalInput = !body && !parameters.some((parameter) => parameter.required);
      const request = body ? 'body: input,' : parameters.length ? 'params: { query: input },' : '';
      const serializer = mediaType === 'multipart/form-data' ? 'bodySerializer: multipartBody,' : '';
      calls.push(`[${JSON.stringify(name)}]: async (${body || parameters.length ? 'input' : '_input'}: ${inputType}${optionalInput ? ' = {}' : ''}, options: { signal?: AbortSignal } = {}) => {
        const { data } = await client.api.${method.toUpperCase()}(${JSON.stringify(path)}, { ${request} ${serializer} ...options });
        if (data === undefined) throw new Error(${JSON.stringify(`Missing JSON response for ${name}`)});
        return data;
      }`);
    }
  }
  return `\nimport { createClient, ${needsMultipart ? 'multipartBody, ' : ''}type ClientOptions } from '@pixeltable/sdk';

export function createServiceClient(options: ClientOptions) {
  const client = createClient<paths>(options);
  return { ...client, operations: { ${calls.join(',\n')} } };
}
`;
}
