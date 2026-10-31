import { expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import { loadProject } from '@evalkit/cli/project';
import { localReportStore, runMatrix } from '@evalkit/runner';

const projectRoot = resolve(import.meta.dir, '..');

async function scenarioFiles(directory = join(projectRoot, 'scenarios')) {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await scenarioFiles(path)));
    else if (entry.name.endsWith('.eval.ts')) files.push(path);
  }
  return files;
}

// The RFD0007 acceptance suite: a few dozen short, concrete scenarios that
// share their agent, judges and datasets, with no registry and no JSON casts.
test('scenarios stay short, concrete and free of registries and JSON casts', async () => {
  const files = await scenarioFiles();
  expect(files.length).toBeGreaterThanOrEqual(20);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    // Short enough to read at a glance, imports and metrics included.
    expect(source.trimEnd().split('\n').length).toBeLessThan(25);
    expect(source).not.toContain('JSON.parse');
    expect(source).not.toContain('as JsonValue');
    expect(source).not.toContain('registerEvals');
  }
  const support = await readdir(projectRoot);
  expect(support).not.toContain('src/registry.ts');
});

test('every scenario passes in both tones, in suites from its directory', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'evalkit-support-'));
  try {
    const { registry, loadErrors } = await loadProject(projectRoot);
    expect(loadErrors).toEqual([]);
    expect(registry.suites.map((suite) => suite.id).sort()).toEqual([
      'account',
      'billing',
      'shipping',
    ]);
    const files = await scenarioFiles();
    expect(registry.evals).toHaveLength(files.length);
    const matrix = registry.matrices[0]!;
    expect(matrix.count()).toBe(files.length * 2);
    const reports = join(temporaryRoot, 'reports');
    const result = await Effect.runPromise(
      runMatrix(matrix, {
        report: localReportStore(reports),
        root: projectRoot,
        workspaceRoot: join(temporaryRoot, 'sandbox'),
        runtime: 'local',
        concurrency: 8,
        trials: 2,
      }),
    );
    expect(result).toEqual({
      cells: files.length * 2,
      passed: files.length * 2,
      failed: 0,
      cancelled: 0,
    });
    // One digest for the static help center; customers vary by trial seed.
    const helpCenter = new Set<string>();
    const customers = new Set<string>();
    for (const runId of await readdir(reports))
      for (const trialId of await readdir(join(reports, runId, 'trials'))) {
        const manifest = JSON.parse(
          await readFile(
            join(reports, runId, 'trials', trialId, 'manifest.json'),
            'utf8',
          ),
        ) as { datasets: Array<{ id: string; digest: string }> };
        for (const dataset of manifest.datasets)
          (dataset.id === 'help-center' ? helpCenter : customers).add(
            dataset.digest,
          );
      }
    expect(helpCenter.size).toBe(1);
    expect(customers.size).toBeGreaterThan(1);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 60_000);
