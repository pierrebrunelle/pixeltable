import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export function loadGeneratedClient() {
  return loadTypeScriptModule(new URL('./fixtures/client.ts', import.meta.url));
}

export async function loadTypeScriptModule(sourceUrl) {
  const directory = await mkdtemp(fileURLToPath(new URL('.generated-', import.meta.url)));
  try {
    const source = await readFile(sourceUrl, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const path = join(directory, 'client.mjs');
    await writeFile(path, output);
    return await import(pathToFileURL(path).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
