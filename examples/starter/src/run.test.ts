import { expect, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { localReportStore, runEval } from '@evalkit/runner';
import { loadProject } from '@evalkit/cli/project';

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

  const result = await Effect.runPromise(
    runEval(evaluation, {
      report: localReportStore(reportRoot),
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b3c',
      trials: 1,
      runtime: 'local',
      trialId: '0197f17c-4d89-7f81-9d42-6c497e6f6b3d',
    }),
  );

  expect(result.status).toBe('completed');
  expect(result.scoring?.overall).toBe(1);
  const summary = JSON.parse(
    await readFile(
      join(
        reportRoot,
        '0197f17c-4d89-7f81-9d42-6c497e6f6b3c',
        'trials',
        '0197f17c-4d89-7f81-9d42-6c497e6f6b3d',
        'summary.json',
      ),
      'utf8',
    ),
  ) as { status: string; artifacts: { path: string }[] };
  expect(summary.status).toBe('completed');
  expect(summary.artifacts).toContainEqual(
    expect.objectContaining({
      kind: 'file',
      path: 'candidate/starter/README.md',
    }),
  );
});
