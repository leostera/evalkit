import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadProject } from './project.js';
import { parseRunArgs } from './run-command.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-project-'));
  roots.push(root);
  await mkdir(join(root, 'evals'), { recursive: true });
  return root;
}
const evaluation = (id: number) => `export default {
  uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b0${id}', slug: 'task-${id}',
  agent: { async start({context}) { if (context.parameters?.maxTokens !== 10000) throw new Error('missing override'); return { async send() {}, async close() {} }; } },
  transcript: [], scoring: []
};`;

test('discovers sorted eval modules without importing helpers or excluded files', async () => {
  const root = await project();
  await writeFile(join(root, 'evals/b.eval.ts'), evaluation(2));
  await writeFile(join(root, 'evals/a.eval.js'), evaluation(1));
  await writeFile(join(root, 'evals/helper.ts'), 'throw new Error("helper imported")');
  await writeFile(join(root, 'evals/skip.eval.ts'), 'throw new Error("excluded imported")');
  await writeFile(join(root, 'evalkit.config.js'), `export default {exclude:['skip.eval.ts'], matrix:{parameters:{model:['a','b']}}};`);
  const loaded = await loadProject(root);
  expect(loaded.registry.evals.map(e => e.slug)).toEqual(['task-1', 'task-2']);
  expect(loaded.registry.matrices[0]!.count()).toBe(4);
  expect(loaded.registry.matrices[0]!.count({parameters:{model:['a']}})).toBe(2);
});

test('config-relative discovery, duplicate IDs, and ambiguous configs fail clearly', async () => {
  const root = await project();
  await writeFile(join(root, 'evalkit.config.ts'), 'export default {};');
  await writeFile(join(root, 'evals/a.eval.ts'), evaluation(1));
  expect((await loadProject(tmpdir(), join(root, 'evalkit.config.ts'))).root).toBe(root);
  await writeFile(join(root, 'evals/b.eval.ts'), evaluation(1));
  await expect(loadProject(root)).rejects.toThrow('duplicate eval URI');
  await writeFile(join(root, 'evalkit.config.js'), 'export default {};');
  await expect(loadProject(root)).rejects.toThrow('Multiple Evalkit configs');
});

test('parser handles values before positionals and rejects unknown or invalid flags', () => {
  const parsed = parseRunArgs(['--max-tokens', '10000', '--model=a,b', 'task-1', '--mode', 'with-docs']);
  expect(parsed.positionals).toEqual(['task-1']);
  expect(parsed.parameters).toEqual({maxTokens:10000});
  expect(parsed.selection).toEqual({model:['a','b'], mode:['with-docs']});
  for (const args of [['--max-tokens'], ['--max-tokens', '-1'], ['--trials', '1.5'], ['--typo']]) expect(() => parseRunArgs(args)).toThrow();
});

test('CLI dry-run is side-effect free; execution persists matrix parameters in manifests', async () => {
  const root = await project();
  await writeFile(join(root, 'evals/a.eval.ts'), evaluation(1));
  await writeFile(join(root, 'evalkit.config.js'), `export default {matrix:{parameters:{model:['a','b'],mode:['without-docs','with-docs']}},execution:{maxCells:1}};`);
  const cli = resolve(import.meta.dir, 'index.ts');
  const invoke = async (args: string[]) => {
    const child = Bun.spawn(['bun', cli, 'run-evals', ...args], {cwd:root, stdout:'pipe', stderr:'pipe'});
    const [out, err, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return {out, err, status};
  };
  const dry = await invoke(['--dry-run']);
  expect(dry.status).toBe(0);
  expect(JSON.parse(dry.out).cells).toBe(4);
  expect(await readdir(root)).not.toContain('_evalkit-results');
  expect((await invoke([])).err).toContain('Selected 4 cells');
  const run = await invoke(['--model','a','--mode','with-docs','--max-tokens','10000']);
  expect(run.status).toBe(0);
  const runs = await readdir(join(root,'_evalkit-results'));
  expect(runs).toHaveLength(1);
  const manifest = JSON.parse(await readFile(join(root,'_evalkit-results',runs[0]!,'manifest.json'),'utf8'));
  expect(manifest.parameters).toEqual({model:'a',mode:'with-docs',maxTokens:10000});
  expect(manifest.matrix.cellKey).toContain('with-docs');
});
