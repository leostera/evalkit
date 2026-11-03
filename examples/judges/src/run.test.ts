import { expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import { loadProject } from '@evalkit/cli/project';
import {
  localReportStore,
  readRunManifest,
  readRunScoring,
  readRunSummary,
  runMatrix,
} from '@evalkit/runner';

const projectRoot = resolve(import.meta.dir, '..');

test('judges explain why the small model fails, with the judge model the matrix chose', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'evalkit-judges-'));
  try {
    const { registry, config, loadErrors } = await loadProject(projectRoot);
    expect(loadErrors).toEqual([]);
    const reports = join(temporaryRoot, 'reports');
    const result = await Effect.runPromise(
      runMatrix(registry.matrices[0]!, {
        report: localReportStore(reports),
        root: projectRoot,
        workspaceRoot: join(temporaryRoot, 'sandbox'),
        runtime: 'local',
        judge: config.judge,
      }),
    );
    expect(result).toMatchObject({ runs: 6, passed: 4, failed: 2 });
    const runs = await Promise.all(
      (await readdir(reports)).map(async (runId) => {
        const manifest = await readRunManifest(reports, runId);
        const summary = await readRunSummary(reports, runId);
        return {
          scenario: manifest.evalId,
          model: (manifest.parameters as { model?: string } | undefined)?.model,
          passed: summary.status === 'passed',
          run: await readRunScoring(reports, runId),
        };
      }),
    );
    expect(
      runs
        .filter((run) => !run.passed)
        .map((run) => `${run.scenario}/${run.model}`)
        .sort(),
    ).toEqual(['purge-single-url/small', 'versioned-notes/small']);

    const purge = runs.find(
      (run) => run.scenario === 'purge-single-url' && run.model === 'small',
    )!.run;
    const correctness = purge.results.find(
      (score) => score.name === 'Correctness',
    )!;
    expect(correctness).toMatchObject({
      choice: 'C',
      value: 0,
      passed: false,
      passAt: 0.5,
      judge: { model: 'judge-large' },
    });
    expect(correctness.judge?.prompt).toContain(
      'How do I purge one URL from the cache?',
    );
    const tone = purge.results.find((score) => score.name === 'Tone')!;
    expect(tone.criteria?.find((c) => c.name === 'no disclosure')?.value).toBe(
      0,
    );
    expect(tone.value).toBeCloseTo(0.8);
    expect(
      purge.metrics?.find((metric) => metric.name === 'judge tokens')?.value,
    ).toBeGreaterThan(0);

    const notes = runs.find(
      (run) => run.scenario === 'versioned-notes' && run.model === 'small',
    )!.run;
    const history = notes.results.find((score) => score.name === 'history')!;
    expect(history.explanation).toBe(
      'Got 2 history entries for a, expected 3.',
    );
    expect(history.evidence).toHaveLength(2);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
