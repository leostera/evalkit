import { afterEach, expect, test } from 'bun:test';
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readdir,
  readFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadProject } from './project.js';
import { parseRunArgs } from './run-command.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-project-'));
  roots.push(root);
  await mkdir(join(root, 'scenarios'), { recursive: true });
  return root;
}
const evaluation = (id: number) => `export default {
  id: 'task-${id}',
  agent: { async start({context}) { if (context.parameters?.maxTokens !== 10000) throw new Error('missing override'); return { async send() {}, async close() {} }; } },
  transcript: [], scoring: []
};`;

test('discovers sorted eval modules without importing helpers or excluded files', async () => {
  const root = await project();
  await writeFile(join(root, 'scenarios/b.eval.ts'), evaluation(2));
  await writeFile(join(root, 'scenarios/a.eval.js'), evaluation(1));
  await writeFile(
    join(root, 'scenarios/helper.ts'),
    'throw new Error("helper imported")',
  );
  await writeFile(
    join(root, 'scenarios/skip.eval.ts'),
    'throw new Error("excluded imported")',
  );
  await writeFile(
    join(root, 'evalkit.config.js'),
    `export default {exclude:['skip.eval.ts'], matrix:{parameters:{model:['a','b']}}};`,
  );
  const loaded = await loadProject(root);
  expect(loaded.registry.evals.map((e) => e.id)).toEqual(['task-1', 'task-2']);
  expect(loaded.registry.matrices[0]!.count()).toBe(4);
  expect(
    loaded.registry.matrices[0]!.count({ parameters: { model: ['a'] } }),
  ).toBe(2);
});

test('directories below scenarios/ are suites', async () => {
  const root = await project();
  await mkdir(join(root, 'scenarios/support/nested'), { recursive: true });
  await writeFile(join(root, 'scenarios/smoke.eval.ts'), evaluation(1));
  await writeFile(join(root, 'scenarios/support/a.eval.ts'), evaluation(2));
  await writeFile(
    join(root, 'scenarios/support/nested/b.eval.ts'),
    evaluation(3),
  );
  const loaded = await loadProject(root);
  expect(loaded.registry.suiteMetadata()).toEqual([
    { id: 'support', evalIds: ['task-2', 'task-3'] },
  ]);
  expect(loaded.registry.metadata().find((e) => e.id === 'task-1')).toEqual({
    id: 'task-1',
  });
  await writeFile(
    join(root, 'evalkit.config.js'),
    'export default { discovery: { suites: false } };',
  );
  expect((await loadProject(root)).registry.suites).toEqual([]);
});

test('a file that fails to import becomes a load error, not a failed project', async () => {
  const root = await project();
  await mkdir(join(root, 'scenarios/billing'), { recursive: true });
  await writeFile(join(root, 'scenarios/a.eval.ts'), evaluation(1));
  await writeFile(
    join(root, 'scenarios/billing/refunds.eval.ts'),
    'throw new Error("API_TOKEN is not set");',
  );
  const loaded = await loadProject(root);
  expect(loaded.registry.evals.map((e) => e.id)).toEqual(['task-1']);
  expect(loaded.loadErrors).toEqual([
    {
      file: 'scenarios/billing/refunds.eval.ts',
      suiteId: 'billing',
      error: expect.objectContaining({ message: 'API_TOKEN is not set' }),
    },
  ]);
});

test('an old evals/ directory gets a hint to move it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-project-'));
  roots.push(root);
  await mkdir(join(root, 'evals'));
  await expect(loadProject(root)).rejects.toThrow(
    "move evals/ there, or set testDir: 'evals'",
  );
});

test('config-relative discovery, duplicate IDs, and ambiguous configs fail clearly', async () => {
  const root = await project();
  await writeFile(join(root, 'evalkit.config.ts'), 'export default {};');
  await writeFile(join(root, 'scenarios/a.eval.ts'), evaluation(1));
  expect(
    (await loadProject(tmpdir(), join(root, 'evalkit.config.ts'))).root,
  ).toBe(root);
  await writeFile(join(root, 'scenarios/b.eval.ts'), evaluation(1));
  await expect(loadProject(root)).rejects.toThrow('duplicate eval ID');
  await writeFile(join(root, 'evalkit.config.js'), 'export default {};');
  await expect(loadProject(root)).rejects.toThrow('Multiple EvalKit configs');
});

test('CLI plans only eligible cells for configured and suite matrices', async () => {
  const root = await project();
  await writeFile(join(root, 'scenarios/a.eval.ts'), evaluation(1));
  await writeFile(
    join(root, 'evalkit.config.js'),
    `export default {
    matrix: { id: 'platforms', parameters: { os: ['windows', 'linux'], arch: ['arm64', 'x86_64'] }, exclude: [{ os: 'windows', arch: 'arm64' }] }
  };`,
  );
  const matrix = (await loadProject(root)).registry.matrices[0]!;
  expect(matrix.count()).toBe(3);
  const child = Bun.spawn(
    [
      'bun',
      resolve(import.meta.dir, 'index.ts'),
      'run',
      '--matrix',
      'platforms',
      '--dry-run',
    ],
    {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [output, status] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  expect(status).toBe(0);
  expect(JSON.parse(output).cells).toBe(3);
  const excluded = Bun.spawn(
    [
      'bun',
      resolve(import.meta.dir, 'index.ts'),
      'run',
      '--matrix',
      'platforms',
      '--select',
      'os=windows',
      '--select',
      'arch=arm64',
      '--dry-run',
    ],
    { cwd: root, stdout: 'pipe', stderr: 'pipe' },
  );
  const [error, excludedStatus] = await Promise.all([
    new Response(excluded.stderr).text(),
    excluded.exited,
  ]);
  expect(excludedStatus).not.toBe(0);
  expect(error).toContain('no eligible cells');
  expect(await readdir(root)).not.toContain('_evalkit-results');
});

test('parser handles values before positionals and rejects unknown or invalid flags', () => {
  const parsed = parseRunArgs([
    '--max-tokens',
    '10000',
    '--model=a,b',
    'task-1',
    '--mode',
    'with-docs',
  ]);
  expect(parsed.positionals).toEqual(['task-1']);
  expect(parsed.parameters).toEqual({ maxTokens: 10000 });
  expect(parsed.selection).toEqual({ model: ['a', 'b'], mode: ['with-docs'] });
  for (const args of [
    ['--max-tokens'],
    ['--max-tokens', '-1'],
    ['--trials', '1.5'],
    ['--suite', 'one', '--matrix', 'two'],
    ['--suite', 'one', 'eval-id'],
    ['--matrix', 'one', 'eval-id'],
    ['--typo'],
  ])
    expect(() => parseRunArgs(args)).toThrow();
});

test('CLI dry-run is side-effect free; execution persists matrix parameters in manifests', async () => {
  const root = await project();
  await writeFile(join(root, 'scenarios/a.eval.ts'), evaluation(1));
  await writeFile(
    join(root, 'evalkit.config.js'),
    `export default {matrix:{id:'models',parameters:{model:['a','b'],mode:['without-docs','with-docs']}},execution:{maxCells:1}};`,
  );
  const cli = resolve(import.meta.dir, 'index.ts');
  const invoke = async (args: string[], command = 'run') => {
    const child = Bun.spawn(['bun', cli, command, ...args], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [out, err, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err, status };
  };
  const dry = await invoke(['--dry-run']);
  expect(dry.status).toBe(0);
  expect(JSON.parse(dry.out).cells).toBe(4);
  const byId = await invoke(['task-1', '--dry-run']);
  expect(byId.status).toBe(0);
  expect(JSON.parse(byId.out).evals).toEqual(['task-1']);
  expect(JSON.parse(byId.out).cells).toBe(4);
  const matrix = await invoke([
    '--matrix',
    'models',
    '--eval',
    'task-1',
    '--model',
    'a',
    '--mode',
    'with-docs',
    '--dry-run',
  ]);
  expect(matrix.status).toBe(0);
  expect(JSON.parse(matrix.out).matrix).toBe('models');
  expect(JSON.parse(matrix.out).cells).toBe(1);
  expect(await readdir(root)).not.toContain('_evalkit-results');
  expect((await invoke([])).err).toContain('Selected 4 cells');
  const run = await invoke([
    'task-1',
    '--model',
    'a',
    '--mode',
    'with-docs',
    '--max-tokens',
    '10000',
  ]);
  expect(run.status).toBe(0);
  const runs = await readdir(join(root, '_evalkit-results'));
  expect(runs).toHaveLength(1);
  const manifest = JSON.parse(
    await readFile(
      join(root, '_evalkit-results', runs[0]!, 'manifest.json'),
      'utf8',
    ),
  );
  expect(manifest.schemaVersion).toBe(5);
  expect(manifest.evalId).toBe('task-1');
  expect(manifest.evalUri).toBeUndefined();
  expect(manifest.parameters).toEqual({
    model: 'a',
    mode: 'with-docs',
    maxTokens: 10000,
  });
  expect(manifest.matrix.id).toBe('models');
  expect(manifest.matrix.cellKey).toContain('with-docs');
});
