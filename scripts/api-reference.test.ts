import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

const reference = await readFile(
  new URL(
    '../sites/evalkit.leostera.dev/src/content/docs/reference/api.md',
    import.meta.url,
  ),
  'utf8',
);
const documented = new Set(reference.match(/(?<=`)[A-Za-z_]\w*/g) ?? []);

// The reference is written by hand; this keeps it from silently missing exports.
test.each([
  ['@leostera/evalkit', '../packages/evalkit/src/index.ts'],
  ['@leostera/evalkit/runner', '../packages/evalkit/src/runner.ts'],
])('every runtime export of %s is in the API reference', async (_, entry) => {
  const exports = Object.keys(
    await import(new URL(entry, import.meta.url).href),
  );
  expect(exports.filter((name) => !documented.has(name)).sort()).toEqual([]);
});
