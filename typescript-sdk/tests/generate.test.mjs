import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../bin/generate.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/openapi.json', import.meta.url));

test('generator reproduces the checked-in service types, including Blob uploads', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pxt-codegen-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'nested', 'service.d.ts');
  execFileSync(process.execPath, [cli, fixture, '--output', output]);
  assert.equal(
    await readFile(output, 'utf8'),
    await readFile(new URL('./fixtures/service.d.ts', import.meta.url), 'utf8'),
  );
  assert.match(await readFile(output, 'utf8'), /Blob/);
});

test('generator rejects invalid input without replacing the output', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'pxt-codegen-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'bad.json');
  const output = join(dir, 'types.d.ts');
  await writeFile(input, '{"not":"openapi"}');
  await writeFile(output, 'keep me');
  const result = spawnSync(process.execPath, [cli, input, '-o', output]);
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(output, 'utf8'), 'keep me');
  assert.notEqual(spawnSync(process.execPath, [cli]).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, '--help']).status, 0);
});
