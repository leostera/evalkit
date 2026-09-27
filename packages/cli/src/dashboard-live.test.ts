import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runId = '9c67c094-94cd-4bfc-9ddf-b48b813e4331';
const trialId = '84d8bf4a-c7d3-4887-b56f-70934b66cfb3';

test('dashboard API lists a run and trial before their summaries exist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-dashboard-running-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const runDir = join(root, '_evalkit-results', runId);
  const trialDir = join(runDir, 'trials', trialId);
  await mkdir(join(root, 'evals'), { recursive: true });
  await writeFile(
    join(root, 'evals', 'echo.eval.js'),
    "export default { id: 'echo', agent: { start: async () => ({ send: async () => {}, close: async () => {} }) }, transcript: [], scoring: [] };\n",
  );
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(new URL('./index.ts', import.meta.url)),
      'serve-dashboard',
    ],
    {
      cwd: root,
      env: { ...process.env, PORT: String(port), EVALKIT_NO_OPEN: '1' },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  );
  const url = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        ready = (await fetch(`${url}/v1/runs`)).ok;
        if (ready) break;
      } catch {
        /* server is still starting */
      }
      await Bun.sleep(50);
    }
    expect(ready).toBe(true);
    await mkdir(trialDir, { recursive: true });
    await writeFile(
      join(runDir, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 2,
        runUri: `evalkit:run:${runId}`,
        evalId: 'echo',
        matrix: { id: 'benchmark', cellKey: 'echo-glm-with' },
        parameters: { model: 'glm', mode: 'with', turnBudget: 6 },
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    await writeFile(
      join(trialDir, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 2,
        runUri: `evalkit:run:${runId}`,
        trialUri: `evalkit:trial:${trialId}`,
        evalId: 'echo',
        trialIndex: 0,
        startedAt: '2026-01-01T00:00:01.000Z',
      }),
    );
    const runs = (await (await fetch(`${url}/v1/runs`)).json()) as {
      runs: Array<{
        id: string;
        status: string;
        matrixId?: string;
        parameters?: object;
      }>;
    };
    expect(runs.runs).toMatchObject([
      {
        id: runId,
        status: 'running',
        matrixId: 'benchmark',
        parameters: { model: 'glm', mode: 'with', turnBudget: 6 },
      },
    ]);
    const trials = (await (
      await fetch(`${url}/v1/runs/${runId}/trials`)
    ).json()) as { trials: Array<{ id: string; status: string }> };
    expect(trials.trials).toMatchObject([{ id: trialId, status: 'running' }]);
    const detail = (await (
      await fetch(`${url}/v1/runs/${runId}/trials/${trialId}`)
    ).json()) as { summary: { status: string } };
    expect(detail.summary.status).toBe('running');
    const events = (await (
      await fetch(`${url}/v1/runs/${runId}/trials/${trialId}/events`)
    ).json()) as { events: unknown[] };
    expect(events.events).toEqual([]);
    await writeFile(
      join(runDir, 'summary.json'),
      JSON.stringify({
        status: 'completed',
        endedAt: '2026-01-01T00:00:02.000Z',
        trialCount: 1,
        passed: 1,
        failed: 0,
      }),
    );
    const completed = (await (await fetch(`${url}/v1/runs`)).json()) as {
      runs: Array<{ status: string }>;
    };
    expect(completed.runs[0]?.status).toBe('passed');
  } finally {
    child.kill();
    await child.exited;
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
