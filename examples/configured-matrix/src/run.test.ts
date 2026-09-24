import { expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import { loadProject } from '@evalkit/cli/project';
import { localReportStore, runMatrix } from '@evalkit/runner';

const projectRoot = resolve(import.meta.dir, '..');

test('discovers a configured matrix and records both selected parameter cells', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'evalkit-matrix-'));
  try {
    const { config, registry } = await loadProject(projectRoot);
    expect(config.matrix?.id).toBe('letter-case');
    expect(registry.evals.map((evaluation) => evaluation.id)).toEqual(['case-transform']);
    const matrix = registry.matrices[0]!;
    expect(matrix.count()).toBe(2);
    const reports = join(temporaryRoot, 'reports');
    const result = await Effect.runPromise(runMatrix(matrix, {
      report: localReportStore(reports),
      workspaceRoot: join(temporaryRoot, 'sandbox'),
      runtime: 'local',
      concurrency: 2,
    }));
    expect(result).toEqual({ cells: 2, passed: 2, failed: 0 });
    const styles: string[] = [];
    for (const runId of await readdir(reports)) {
      const manifest = JSON.parse(await readFile(join(reports, runId, 'manifest.json'), 'utf8'));
      expect(manifest.evalId).toBe('case-transform');
      expect(manifest.matrix.id).toBe('letter-case');
      styles.push(manifest.parameters.style);
      const trialId = (await readdir(join(reports, runId, 'trials')))[0]!;
      const scoring = JSON.parse(await readFile(join(reports, runId, 'trials', trialId, 'scoring.json'), 'utf8'));
      expect(scoring.passed).toBe(true);
    }
    expect(styles.sort()).toEqual(['lower', 'upper']);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
