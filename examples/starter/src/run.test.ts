import { expect, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { localReportStore, runEval } from '@evalkit/runner';

import registry from './registry.js';

process.chdir(
  dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
);

test('runs the starter eval and writes an inspectable report', async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), 'evalkit-starter-'));
  const evaluation = registry.get('starter-greeting');
  if (!evaluation) throw new Error('Starter eval is not registered');

  const result = await Effect.runPromise(
    runEval(evaluation, {
      report: localReportStore(reportRoot),
      runId: 'starter-run',
      trials: 1,
      runtime: 'local',
      trialId: 'starter-trial',
    }),
  );

  expect(result.status).toBe('completed');
  expect(result.scoring?.overall).toBe(1);
  const summary = JSON.parse(
    await readFile(
      join(
        reportRoot,
        'starter-run',
        'trials',
        'starter-trial',
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
