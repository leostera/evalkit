import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineAgent, defineEval, user } from '@evalkit/core';
import { localReportStore, runEval } from '@evalkit/runner';
import { Effect } from 'effect';
import { createDashboardReportReader } from './dashboard-reports.js';

const runId = '9c67c094-94cd-4bfc-9ddf-b48b813e4331';

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
    const reports = createDashboardReportReader(root);
    expect(await reports.listRuns()).toEqual([]);
    const directory = join(root, runId);
    await mkdir(directory);
    expect(await reports.listRuns()).toEqual([]); // manifest has not been persisted yet
    await writeFile(join(directory, 'manifest.json'), '{broken json');
    await expect(reports.listRuns()).rejects.toThrow();
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 6,
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

test('runs from an older report format are skipped and counted, not fatal', async () => {
  await withReports(async (root) => {
    const reports = createDashboardReportReader(root);
    await mkdir(join(root, runId));
    await writeFile(
      join(root, runId, 'manifest.json'),
      JSON.stringify({ schemaVersion: 5, evalId: 'old' }),
    );
    expect(await reports.listRuns()).toEqual([]);
    expect(reports.legacyRunIds()).toEqual([runId]);
    // Listing again does not count it twice.
    await reports.listRuns();
    expect(reports.legacyRunIds()).toEqual([runId]);
  });
});

test('artifact listings share a walker; candidate reads cannot escape their root', async () => {
  await withReports(async (root) => {
    const artifacts = join(root, runId, 'artifacts');
    await mkdir(join(artifacts, 'candidate', 'nested'), { recursive: true });
    await mkdir(join(artifacts, 'evaluator'));
    await writeFile(
      join(artifacts, 'candidate', 'nested', 'reply.txt'),
      'Hello',
    );
    await writeFile(join(artifacts, 'evaluator', 'answer.txt'), 'private');
    const reports = createDashboardReportReader(root);
    expect(
      (await reports.listArtifacts(runId)).map(({ path }) => path),
    ).toContain('evaluator/answer.txt');
    expect(
      (await reports.listCandidateWorkspace(runId)).map(({ path }) => path),
    ).toContain('nested/reply.txt');
    expect(
      (await reports.listCandidateWorkspace(runId)).map(({ path }) => path),
    ).not.toContain('evaluator/answer.txt');
    expect(
      await (await reports.candidateFile(runId, 'nested/reply.txt')).text(),
    ).toBe('Hello');
    await expect(
      reports.candidateFile(runId, '../evaluator/answer.txt'),
    ).rejects.toThrow('Invalid workspace path');
  });
});

test('agent-written files are served as untrusted bytes, never as HTML', async () => {
  await withReports(async (root) => {
    const artifacts = join(root, runId, 'artifacts');
    await mkdir(join(artifacts, 'candidate'), { recursive: true });
    await mkdir(join(artifacts, 'attachments', 'logs'), { recursive: true });
    await writeFile(
      join(artifacts, 'candidate', 'page.html'),
      '<script>x</script>',
    );
    await writeFile(join(artifacts, 'attachments', 'logs', 'agent.log'), 'log');
    const reports = createDashboardReportReader(root);
    for (const response of [
      await reports.candidateFile(runId, 'page.html'),
      await reports.attachmentFile(runId, 'logs/agent.log'),
    ]) {
      expect(response.headers.get('content-type')).toBe(
        'application/octet-stream',
      );
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toBe('sandbox');
    }
    await expect(
      reports.attachmentFile(runId, '../candidate/page.html'),
    ).rejects.toThrow('Invalid attachment path');
    await expect(reports.attachmentFile(runId, 'logs')).rejects.toThrow(
      'Attachment is not a file',
    );
  });
});

test('a run lists its batch, scores and metrics; one it did not measure has no value', async () => {
  await withReports(async (root) => {
    const evaluation = defineEval({
      id: 'counts-tools',
      agent: defineAgent({
        async start() {
          return {
            send: async () => ({
              reply: 'ok',
              toolCalls: [{ name: 'bash' }, { name: 'bash' }],
            }),
          };
        },
      }),
      transcript: [user('go')],
      scoring: [],
      repeat: 2,
    });
    const runs = await Effect.runPromise(
      runEval(evaluation, { report: localReportStore(root) }),
    );
    const reports = createDashboardReportReader(root);
    const listed = await reports.listRuns();
    expect(listed).toHaveLength(2);
    const run = listed.find((entry) => entry.id === runs[0]!.runId)!;
    expect(run).toMatchObject({
      evalId: 'counts-tools',
      status: 'passed',
      batch: runs[0]!.batch,
    });
    expect(run.metrics?.find((metric) => metric.name === 'tool calls')).toEqual(
      { name: 'tool calls', builtIn: true, value: 2 },
    );
    // No turn reported usage: tokens were not measured.
    expect(
      run.metrics?.find((metric) => metric.name === 'tokens')?.value,
    ).toBeUndefined();
    const detail = await reports.runDetail(run.id);
    expect(detail.summary).toMatchObject({ status: 'passed' });
    expect(detail.manifest).toMatchObject({ batch: runs[0]!.batch });
  });
});
