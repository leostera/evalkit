import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  compareRuns,
  comparisonMarkdown,
  gateFailures,
  parseFailOn,
  type ComparedRun,
} from './compare.js';
import { resolveSharedRef } from './compare-command.js';

const run = (
  evalId: string,
  status: ComparedRun['status'],
  extra: Partial<ComparedRun> = {},
): ComparedRun => ({
  id: `${evalId}-${status}-${extra.startedAt ?? '1'}`,
  evalId,
  status,
  startedAt: extra.startedAt ?? '2026-01-01T00:00:00.000Z',
  suiteId: 'support',
  scorers: [
    {
      name: 'correct',
      kind: 'predicate',
      mean: status === 'passed' ? 1 : 0,
      count: 1,
      skipped: 0,
    },
  ],
  ...extra,
});

test('classifies units and averages scorers over matched units', () => {
  const comparison = compareRuns(
    [
      run('a', 'passed'),
      run('b', 'failed'),
      run('c', 'passed'),
      run('gone', 'passed'),
      run('err', 'errored'),
      run('d', 'passed', { datasets: [{ id: 'help', digests: ['x'] }] }),
    ],
    [
      run('a', 'failed'),
      run('b', 'passed'),
      run('b', 'failed', { startedAt: '2025-01-01T00:00:00.000Z' }),
      run('c', 'passed'),
      run('new', 'passed'),
      run('err', 'passed'),
      run('d', 'passed', { datasets: [{ id: 'help', digests: ['y'] }] }),
    ],
  );
  const changes = Object.fromEntries(
    comparison.units.map((unit) => [unit.evalId, unit.change]),
  );
  expect(changes).toEqual({
    a: 'regressed',
    b: 'fixed',
    c: 'unchanged',
    d: 'unchanged',
    err: 'not-comparable',
    gone: 'removed',
    new: 'new',
  });
  expect(comparison.ignoredRuns).toEqual({ base: 0, head: 1 });
  expect(comparison.changedDatasets).toEqual(['help']);
  expect(comparison.suites[0]).toMatchObject({
    suite: 'support',
    base: { passed: 4, total: 6 },
    head: { passed: 5, total: 6 },
  });
  // a (1→0), b (0→1), c (1→1), d (1→1): err is not comparable.
  expect(comparison.suites[0]!.scorers).toEqual([
    { name: 'correct', kind: 'predicate', base: 0.75, head: 0.75 },
  ]);
  expect(gateFailures(comparison, parseFailOn(['regression']))).toEqual([
    '1 regressed: support/a',
  ]);
  expect(comparisonMarkdown(comparison, { base: 'b1', head: 'h1' })).toContain(
    '**1 regressed** · 1 fixed · 1 new · 1 removed · 2 unchanged · 1 not comparable',
  );
});

test('matches units by parameters and refuses to compare different scorers', () => {
  const comparison = compareRuns(
    [
      run('a', 'passed', { parameters: { model: 'x' } }),
      run('a', 'passed', { parameters: { model: 'y' } }),
    ],
    [
      run('a', 'failed', { parameters: { model: 'x' } }),
      run('a', 'passed', {
        parameters: { model: 'y' },
        scorers: [
          { name: 'renamed', kind: 'predicate', mean: 1, count: 1, skipped: 0 },
        ],
      }),
    ],
  );
  expect(comparison.units.map((unit) => [unit.label, unit.change])).toEqual([
    ['support/a [model=x]', 'regressed'],
    ['support/a [model=y]', 'not-comparable'],
  ]);
  expect(comparison.suites[0]!.scorers.map((s) => [s.name, s.onlyOn])).toEqual([
    ['correct', 'base'],
    ['renamed', 'head'],
  ]);
});

test('score-drop gates on scorer means', () => {
  const comparison = compareRuns(
    [
      run('a', 'passed', {
        scorers: [
          { name: 's', kind: 'judge', mean: 0.9, count: 1, skipped: 0 },
        ],
      }),
    ],
    [
      run('a', 'passed', {
        scorers: [
          { name: 's', kind: 'judge', mean: 0.7, count: 1, skipped: 0 },
        ],
      }),
    ],
  );
  expect(
    gateFailures(comparison, parseFailOn(['score-drop=0.1'])),
  ).toHaveLength(1);
  expect(gateFailures(comparison, parseFailOn(['score-drop=0.3']))).toEqual([]);
  expect(() => parseFailOn(['sometimes'])).toThrow('Unknown --fail-on');
});

test('resolves shared refs by SHA, prefix, or branch', () => {
  const commits = [
    { commit: 'a'.repeat(40), ref: 'main' },
    { commit: `b${'0'.repeat(39)}`, ref: 'main' },
  ];
  expect(resolveSharedRef(commits, 'a'.repeat(40))).toBe('a'.repeat(40));
  expect(resolveSharedRef(commits, 'b000000')).toBe(`b${'0'.repeat(39)}`);
  expect(resolveSharedRef(commits, 'main')).toBe('a'.repeat(40));
  expect(resolveSharedRef(commits, 'c'.repeat(40))).toBeUndefined();
});

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

test('evalkit compare --base-dir writes markdown and gates regressions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-compare-'));
  roots.push(root);
  await mkdir(join(root, 'scenarios'), { recursive: true });
  const write = (reply: string) =>
    writeFile(
      join(root, 'scenarios/a.eval.js'),
      `export default { id: 'a', agent: { async start() { return { async send() { return ${JSON.stringify(reply)}; } }; } },
        transcript: [{ kind: 'user', message: 'hi' }],
        scoring: [{ kind: 'predicate', name: 'ok', run: ({ output }) => output === 'ok' }] };`,
    );
  const cli = resolve(import.meta.dir, 'index.ts');
  const invoke = async (args: string[], commit: string) => {
    const child = Bun.spawn(['bun', cli, ...args], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NO_COLOR: '1',
        EVALKIT_SOURCE_REPO: 'https://gitlab.example.com/team/evals',
        EVALKIT_SOURCE_COMMIT: commit,
      },
    });
    const [out, err, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err, status };
  };
  await write('ok');
  expect((await invoke(['run'], 'a'.repeat(40))).status).toBe(0);
  await rm(join(root, 'base'), { recursive: true, force: true });
  await Bun.$`mv ${join(root, '_evalkit-results')} ${join(root, 'base')}`.quiet();
  await write('nope');
  expect((await invoke(['run'], 'b'.repeat(40))).status).toBe(1);
  const compared = await invoke(
    [
      'compare',
      '--base-dir',
      'base',
      '--markdown',
      'compare.md',
      '--fail-on',
      'regression',
    ],
    'b'.repeat(40),
  );
  expect(compared.status).toBe(1);
  expect(compared.out).toContain('1 regressed');
  expect(compared.out).toContain('a');
  expect(await readFile(join(root, 'compare.md'), 'utf8')).toContain(
    '**Regressed**',
  );
  const missing = await invoke(
    ['compare', '--base-dir', 'nowhere'],
    'b'.repeat(40),
  );
  expect(missing.status).toBe(0);
  expect(missing.out).toContain('nothing to compare');
});

test('evalkit compare --base reads the base commit from the share server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-compare-server-'));
  roots.push(root);
  const { createDirectoryShareApp } = await import('@evalkit/share');
  const app = await createDirectoryShareApp({
    dir: join(root, '_share'),
    dashboardRoot: join(root, '_share-assets'),
  });
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  try {
    await mkdir(join(root, 'project/scenarios'), { recursive: true });
    const project = join(root, 'project');
    await writeFile(
      join(project, 'evalkit.config.js'),
      `export default { share: { url: 'http://localhost:${server.port}' } };`,
    );
    const write = (reply: string) =>
      writeFile(
        join(project, 'scenarios/a.eval.js'),
        `export default { id: 'a', agent: { async start() { return { async send() { return ${JSON.stringify(reply)}; } }; } },
          transcript: [{ kind: 'user', message: 'hi' }],
          scoring: [{ kind: 'predicate', name: 'ok', run: ({ output }) => output === 'ok' }] };`,
      );
    const cli = resolve(import.meta.dir, 'index.ts');
    const invoke = async (args: string[], commit: string, ref: string) => {
      const child = Bun.spawn(['bun', cli, ...args], {
        cwd: project,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          NO_COLOR: '1',
          EVALKIT_SOURCE_REPO: 'https://gitlab.example.com/team/evals',
          EVALKIT_SOURCE_COMMIT: commit,
          EVALKIT_SOURCE_REF: ref,
        },
      });
      const [out, err, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { out, err, status };
    };
    const base = 'c'.repeat(40);
    await write('nope');
    await invoke(['run'], base, 'main');
    const shared = await invoke(['share'], base, 'main');
    expect(shared.err).toBe('');
    await write('ok');
    await invoke(['run'], 'd'.repeat(40), 'feature');
    const compared = await invoke(
      ['compare', '--base', 'main', '--json', '--fail-on', 'regression'],
      'd'.repeat(40),
      'feature',
    );
    expect(compared.status).toBe(0);
    const result = JSON.parse(compared.out);
    expect(result.base).toBe('ccccccc (main)');
    expect(result.counts.fixed).toBe(1);
  } finally {
    server.stop(true);
  }
});
