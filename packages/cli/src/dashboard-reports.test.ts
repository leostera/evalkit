import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerEvals } from '@evalkit/core';
import { createDashboardReportReader } from './dashboard-reports.js';

const runId = '9c67c094-94cd-4bfc-9ddf-b48b813e4331';
const trialId = '84d8bf4a-c7d3-4887-b56f-70934b66cfb3';

async function withReports(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-report-query-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('an incomplete run is omitted, but a corrupt manifest or summary is reported', async () => {
  await withReports(async (root) => {
    const reports = createDashboardReportReader(root, registerEvals([]));
    expect(await reports.listRuns()).toEqual([]);
    const directory = join(root, runId);
    await mkdir(directory);
    expect(await reports.listRuns()).toEqual([]); // manifest has not been persisted yet
    await writeFile(join(directory, 'manifest.json'), '{broken json');
    await expect(reports.listRuns()).rejects.toThrow();
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 2,
        runUri: `evalkit:run:${runId}`,
        evalId: 'echo',
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(await reports.listRuns()).toMatchObject([
      { id: runId, status: 'running' },
    ]);
    await writeFile(join(directory, 'summary.json'), '{broken json');
    await expect(reports.listRuns()).rejects.toThrow();
  });
});

test('artifact listings share a walker; candidate reads cannot escape their root', async () => {
  await withReports(async (root) => {
    const artifacts = join(root, runId, 'trials', trialId, 'artifacts');
    await mkdir(join(artifacts, 'candidate', 'nested'), { recursive: true });
    await mkdir(join(artifacts, 'evaluator'));
    await writeFile(
      join(artifacts, 'candidate', 'nested', 'reply.txt'),
      'Hello',
    );
    await writeFile(join(artifacts, 'evaluator', 'answer.txt'), 'private');
    const reports = createDashboardReportReader(root, registerEvals([]));
    expect(
      (await reports.listArtifacts(runId, trialId)).map(({ path }) => path),
    ).toContain('evaluator/answer.txt');
    expect(
      (await reports.listCandidateWorkspace(runId, trialId)).map(
        ({ path }) => path,
      ),
    ).toContain('nested/reply.txt');
    expect(
      (await reports.listCandidateWorkspace(runId, trialId)).map(
        ({ path }) => path,
      ),
    ).not.toContain('evaluator/answer.txt');
    expect(
      await (
        await reports.candidateFile(runId, trialId, 'nested/reply.txt')
      ).text(),
    ).toBe('Hello');
    await expect(
      reports.candidateFile(runId, trialId, '../evaluator/answer.txt'),
    ).rejects.toThrow('Invalid workspace path');
  });
});
