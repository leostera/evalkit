import { expect, test } from 'bun:test';
import type { RunResult } from '@evalkit/core';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { localReportStore, runEval } from '@evalkit/runner';
import { loadProject } from '@evalkit/cli/project';

/** Runs a scenario once and returns its one run. */
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

process.chdir(
  dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
);

test('discovers and runs the starter eval without a config or registry', async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), 'evalkit-starter-'));
  const { config, registry } = await loadProject(process.cwd());
  expect(config).toEqual({});
  expect(registry.evals.map((evaluation) => evaluation.id)).toEqual([
    'greeting',
    'pi-greeting',
    'pi-number',
  ]);
  const evaluation = registry.get('greeting');
  if (!evaluation) throw new Error('Starter eval was not discovered');

  const result = await runOne(
    runEval(evaluation, {
      report: localReportStore(reportRoot),
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b3c',
      // The scenario repeats 10 times; once is enough here.
      repeat: 1,
    }),
  );

  expect(result.status).toBe('passed');
  expect(result.scoring?.overall).toBe(1);
  const summary = JSON.parse(
    await readFile(
      join(reportRoot, '0197f17c-4d89-7f81-9d42-6c497e6f6b3c', 'summary.json'),
      'utf8',
    ),
  ) as { status: string; artifacts: { path: string }[] };
  expect(summary.status).toBe('passed');
  expect(summary.artifacts).toContainEqual(
    expect.objectContaining({
      kind: 'file',
      path: 'candidate/starter/README.md',
    }),
  );
});
