import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineAgent, defineEval, registerEvals, user } from '@evalkit/core';
import { localReportStore, runEval } from '@evalkit/runner';
import { Effect } from 'effect';
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

test('runs from an older report format are skipped and counted, not fatal', async () => {
  await withReports(async (root) => {
    const reports = createDashboardReportReader(root, registerEvals([]));
    await mkdir(join(root, runId));
    await writeFile(
      join(root, runId, 'manifest.json'),
      JSON.stringify({ schemaVersion: 1, evalId: 'old' }),
    );
    expect(await reports.listRuns()).toEqual([]);
    expect(reports.legacyRunIds()).toEqual([runId]);
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

test('agent-written files are served as untrusted bytes, never as HTML', async () => {
  await withReports(async (root) => {
    const artifacts = join(root, runId, 'trials', trialId, 'artifacts');
    await mkdir(join(artifacts, 'candidate'), { recursive: true });
    await mkdir(join(artifacts, 'attachments', 'logs'), { recursive: true });
    await writeFile(
      join(artifacts, 'candidate', 'page.html'),
      '<script>x</script>',
    );
    await writeFile(join(artifacts, 'attachments', 'logs', 'agent.log'), 'log');
    const reports = createDashboardReportReader(root, registerEvals([]));
    for (const response of [
      await reports.candidateFile(runId, trialId, 'page.html'),
      await reports.attachmentFile(runId, trialId, 'logs/agent.log'),
    ]) {
      expect(response.headers.get('content-type')).toBe(
        'application/octet-stream',
      );
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toBe('sandbox');
    }
    await expect(
      reports.attachmentFile(runId, trialId, '../candidate/page.html'),
    ).rejects.toThrow('Invalid attachment path');
    await expect(
      reports.attachmentFile(runId, trialId, 'logs'),
    ).rejects.toThrow('Attachment is not a file');
  });
});

test('a trial from before metrics existed is not measured: left out of the mean, and counted', async () => {
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
      policy: { trials: 2 },
    });
    const result = await Effect.runPromise(
      runEval(evaluation, { report: localReportStore(root) }),
    );
    // Rewrite one trial as an older EvalKit would have saved it.
    const old = join(
      root,
      result.runId,
      'trials',
      result.trials![0]!.trialId,
      'summary.json',
    );
    const summary = JSON.parse(await readFile(old, 'utf8'));
    delete summary.scoring.metrics;
    await writeFile(old, JSON.stringify(summary));

    const reports = createDashboardReportReader(
      root,
      registerEvals([evaluation]),
    );
    const [run] = await reports.listRuns();
    expect(
      run?.metrics?.find((metric) => metric.name === 'tool calls'),
    ).toEqual({
      name: 'tool calls',
      builtIn: true,
      mean: 2,
      count: 1,
      trials: 2,
    });
  });
});
