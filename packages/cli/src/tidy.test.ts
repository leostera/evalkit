import { afterEach, expect, test } from 'bun:test';
import type { RunResult } from '@evalkit/core';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import {
  defineEval,
  defineEvalMatrix,
  predicate,
  registerEvals,
  user,
  type EvalDefinition,
} from '@evalkit/core';
import { localReportStore, runEval, runWorkspacePath } from '@evalkit/runner';
import { createDashboardReportReader } from './dashboard-reports.js';
import { projectEvalIds, tidyReports, tidySandboxes } from './tidy.js';

/** Runs a scenario once and returns its one run. */
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const make = (id: string) =>
  defineEval({
    id,
    agent: {
      identity: { kind: 'in-process', id: 'quiet' },
      async start() {
        return { async send() {}, async close() {} };
      },
    },
    transcript: [user('hello')],
    scoring: [],
  });

async function reportsFor(evals: EvalDefinition[]) {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-tidy-'));
  roots.push(root);
  const reportRoot = join(root, '_evalkit-results');
  for (const evaluation of evals)
    await runOne(
      runEval(evaluation, {
        report: localReportStore(reportRoot),
        workspaceRoot: join(root, '_evalkit-sandbox'),
      }),
    );
  return reportRoot;
}

test('project eval IDs include evals reachable only through a matrix', () => {
  const onlyInMatrix = make('matrix-only');
  const registry = registerEvals([
    make('standalone'),
    defineEvalMatrix({ id: 'm', evals: [onlyInMatrix], parameters: {} }),
  ]);
  expect([...projectEvalIds(registry)].sort()).toEqual([
    'matrix-only',
    'standalone',
  ]);
});

test('tidy archives runs of removed evals, is idempotent, and restores returning evals', async () => {
  const keep = make('keep');
  const gone = make('gone');
  const reportRoot = await reportsFor([keep, gone]);
  const withoutGone = registerEvals([keep]);

  const first = await tidyReports({ registry: withoutGone, reportRoot });
  expect(first.archived.map((entry) => entry.evalId)).toEqual(['gone']);
  expect(first).toMatchObject({ current: 1, stillArchived: 0, restored: [] });
  const runs = await createDashboardReportReader(reportRoot).listRuns();
  expect(runs.find((run) => run.evalId === 'gone')?.archived).toBe(true);
  expect(runs.find((run) => run.evalId === 'keep')?.archived).toBeUndefined();

  const again = await tidyReports({ registry: withoutGone, reportRoot });
  expect(again).toMatchObject({ archived: [], stillArchived: 1 });

  const restored = await tidyReports({
    registry: registerEvals([keep, gone]),
    reportRoot,
  });
  expect(restored.restored.map((entry) => entry.evalId)).toEqual(['gone']);
  // Archiving only ever adds or removes the marker; reports stay intact.
  await stat(join(reportRoot, restored.restored[0]!.runId, 'manifest.json'));
});

test('tidy removes sandboxes of passed runs and keeps failed ones', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-tidy-sandbox-'));
  roots.push(root);
  const reportRoot = join(root, '_evalkit-results');
  const sandboxRoot = join(root, '_evalkit-sandbox');
  const scenario = (id: string, passes: boolean) =>
    defineEval({
      ...make(id),
      scoring: [predicate('verdict', () => passes)],
    });
  // Kept by the runner, as runs before keepSandboxes did.
  const run = (evaluation: EvalDefinition) =>
    runOne(
      runEval(evaluation, {
        report: localReportStore(reportRoot),
        workspaceRoot: sandboxRoot,
        keepWorkspaces: 'all',
      }),
    );
  const passed = await run(scenario('passes', true));
  const failed = await run(scenario('fails', false));
  const registry = registerEvals([
    scenario('passes', true),
    scenario('fails', false),
  ]);
  const exists = (runId: string) =>
    stat(runWorkspacePath(sandboxRoot, runId)).then(
      () => true,
      () => false,
    );

  expect(
    await tidySandboxes({ registry, reportRoot, sandboxRoot, keep: 'all' }),
  ).toEqual({ removed: 0 });
  expect(await tidySandboxes({ registry, reportRoot, sandboxRoot })).toEqual({
    removed: 1,
  });
  expect(await exists(passed.runId)).toBe(false);
  expect(await exists(failed.runId)).toBe(true);
  expect(
    await tidySandboxes({ registry, reportRoot, sandboxRoot, keep: 'none' }),
  ).toEqual({ removed: 1 });
  expect(await exists(failed.runId)).toBe(false);
});
