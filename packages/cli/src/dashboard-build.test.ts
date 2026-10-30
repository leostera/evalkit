import { dashboardIndex } from '@evalkit/share';
import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect } from 'effect';
import { defineEval, predicate, registerEvals, user } from '@evalkit/core';
import { localReportStore, runEval } from '@evalkit/runner';
import { createStaticDashboardApi } from '../../dashboard/src/static-api.js';
import { tidyReports } from './tidy.js';
import { buildDashboard, staticRoutes } from './dashboard-build.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const evaluation = defineEval({
  id: 'writes-file',
  agent: {
    identity: { kind: 'in-process', id: 'writer' },
    async start({ context, onEvent }) {
      return {
        async send(message: string) {
          await mkdir(join(context.workspace.root, 'out'), { recursive: true });
          await writeFile(
            join(context.workspace.root, 'out', 'reply.txt'),
            message,
          );
          await writeFile(
            join(context.evaluatorWorkspace.root, 'secret.txt'),
            'answer',
          );
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: message,
            timestamp: new Date().toISOString(),
          });
        },
        async close() {},
      };
    },
  },
  transcript: [user('hello snapshot')],
  scoring: [predicate('always', () => true)],
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-build-'));
  roots.push(root);
  const reportRoot = join(root, '_evalkit-results');
  await Effect.runPromise(
    runEval(evaluation, {
      report: localReportStore(reportRoot),
      workspaceRoot: join(root, '_evalkit-sandbox'),
    }),
  );
  const dashboardRoot = join(root, 'ui');
  await mkdir(join(dashboardRoot, 'assets'), { recursive: true });
  await writeFile(
    join(dashboardRoot, 'index.html'),
    '<!doctype html>\n<html lang="en"><head><script src="/assets/app.js"></script></head></html>\n',
  );
  await writeFile(join(dashboardRoot, 'assets', 'app.js'), '/* ui */');
  return { root, reportRoot, dashboardRoot, outDir: join(root, 'share') };
}

test('static snapshots are readable by the dashboard static API and exclude evaluator files', async () => {
  const paths = await fixture();
  const registry = registerEvals([evaluation]);
  const result = await buildDashboard({ registry, ...paths });
  expect(result).toMatchObject({ runs: 1, trials: 1, files: 1 });
  expect(await readFile(join(paths.outDir, 'index.html'), 'utf8')).toContain(
    '"./assets/app.js"',
  );

  const base = pathToFileURL(`${paths.outDir}/`).href;
  const api = createStaticDashboardApi({
    baseUrl: base,
    fetch: async (input) => {
      const file = Bun.file(new URL(String(input)).pathname);
      return (await file.exists())
        ? new Response(file)
        : new Response('missing', { status: 404 });
    },
  });
  expect(api.readOnly).toBe(true);
  expect((await api.listCatalog()).map((entry) => entry.id)).toEqual([
    'writes-file',
  ]);
  const [run] = await api.listRuns();
  expect(run).toMatchObject({ evalId: 'writes-file', status: 'passed' });
  const [trial] = await api.listTrials(run!.id);
  // Clean URLs: `<mount>/runs/<id>` is served from runs/<id>.html, based one level up.
  expect(
    await readFile(join(paths.outDir, 'runs', `${run!.id}.html`), 'utf8'),
  ).toContain('<base href="../" />');
  expect(
    await readFile(
      join(paths.outDir, 'runs', run!.id, 'trials', `${trial!.id}.html`),
      'utf8',
    ),
  ).toContain('<base href="../../../" />');
  expect(await readFile(join(paths.outDir, 'index.html'), 'utf8')).toContain(
    '<base href="./" />',
  );
  const events = await api.getTrialEvents(run!.id, trial!.id);
  expect(events.some((event) => event.content === 'hello snapshot')).toBe(true);
  expect(await api.listWorkspace(run!.id, trial!.id)).toContainEqual(
    expect.objectContaining({ path: 'out/reply.txt', kind: 'file' }),
  );
  expect(
    await (
      await api.getWorkspaceFile(run!.id, trial!.id, 'out/reply.txt')
    ).text(),
  ).toBe('hello snapshot');
  await expect(api.runEval('writes-file')).rejects.toThrow('read-only');

  const written = await Array.fromAsync(
    new Bun.Glob('**/*').scan({ cwd: paths.outDir, dot: true }),
  );
  expect(written.some((file) => file.includes('secret'))).toBe(false);
  expect(written.some((file) => file.includes('evaluator'))).toBe(false);
});

test('archived runs are left out of the snapshot', async () => {
  const paths = await fixture();
  await tidyReports({
    registry: registerEvals([]),
    reportRoot: paths.reportRoot,
  });
  const result = await buildDashboard({
    registry: registerEvals([evaluation]),
    ...paths,
  });
  expect(result).toMatchObject({ runs: 0, archived: 1, trials: 0 });
  const runs = JSON.parse(
    await readFile(join(paths.outDir, 'data', 'runs.json'), 'utf8'),
  ) as { runs: unknown[] };
  expect(runs.runs).toEqual([]);
});

test('rebuilds its own output but refuses to replace other directories', async () => {
  const paths = await fixture();
  const registry = registerEvals([evaluation]);
  await buildDashboard({ registry, ...paths });
  await buildDashboard({ registry, ...paths });
  const foreign = join(paths.root, 'not-ours');
  await mkdir(foreign);
  await writeFile(join(foreign, 'keep.txt'), 'keep');
  await expect(
    buildDashboard({ registry, ...paths, outDir: foreign }),
  ).rejects.toThrow('Refusing to overwrite');
  expect(await readFile(join(foreign, 'keep.txt'), 'utf8')).toBe('keep');
  expect(resolve(paths.outDir)).toBe(paths.outDir);
});

test('static index adds a base, rewrites asset URLs, and rejects unexpected markup', () => {
  expect(
    dashboardIndex('<html lang="en"><head><a href="/assets/x.css">', {
      base: '../',
    }),
  ).toBe(
    '<html lang="en" data-evalkit-snapshot="static"><head>\n    <base href="../" /><a href="./assets/x.css">',
  );
  expect(() => dashboardIndex('<html><head>', { base: './' })).toThrow(
    'unexpected shape',
  );
});

test('static routes follow scenario, run, trial and skip unsafe IDs', () => {
  expect(
    staticRoutes({
      scenarios: ['hello', 'a/b'],
      runs: [
        { id: 'r1', trials: ['t1', '..'] },
        { id: 'r#2', trials: ['t2'] },
      ],
    }),
  ).toEqual([
    'scenarios',
    'runs',
    'agents',
    'datasets',
    'scenarios/hello',
    'runs/r1',
    'runs/r1/trials/t1',
    'runs/r1/trials/t1/workspace',
  ]);
});
