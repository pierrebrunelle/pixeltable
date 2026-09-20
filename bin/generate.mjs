#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { output: { type: 'string', short: 'o' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) {
    console.log('Usage: pxt-generate-ts openapi.json --output src/pxt.d.ts');
  } else {
    if (positionals.length !== 1 || !values.output) {
      throw new Error('Usage: pxt-generate-ts openapi.json --output src/pxt.d.ts');
    }
    const schema = JSON.parse(await readFile(resolve(positionals[0]), 'utf8'));
    const ast = await openapiTS(schema, {
      transform(schemaObject) {
        if (
          schemaObject.format === 'binary' ||
          (schemaObject.contentMediaType === 'application/octet-stream' && !schemaObject.contentEncoding)
        ) {
          const blob = ts.factory.createTypeReferenceNode('Blob');
          return schemaObject.nullable
            ? ts.factory.createUnionTypeNode([blob, ts.factory.createLiteralTypeNode(ts.factory.createNull())])
            : blob;
        }
      },
    });
    const output = resolve(values.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, '// Generated from the service OpenAPI document. Do not edit.\n' + astToString(ast));
    console.log(`Wrote ${output}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
