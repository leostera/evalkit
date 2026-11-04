import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runId = '9c67c094-94cd-4bfc-9ddf-b48b813e4331';

test('dashboard API lists a run before its summary exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-dashboard-running-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const runDir = join(root, '_evalkit-results', runId);
  await mkdir(join(root, 'scenarios'), { recursive: true });
  await writeFile(
    join(root, 'scenarios', 'echo.eval.js'),
    "export default { id: 'echo', agent: { start: async () => ({ send: async () => {}, close: async () => {} }) }, transcript: [], scoring: [] };\n",
  );
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(new URL('./index.ts', import.meta.url)),
      'dev',
      '--port',
      String(port),
      '--no-open',
    ],
    {
      cwd: root,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  );
  const url = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) {
      try {
        ready = (await fetch(`${url}/v1/runs`)).ok;
        if (ready) break;
      } catch {
        /* server is still starting */
      }
      await Bun.sleep(50);
    }
    expect(ready).toBe(true);
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 8,
        runUri: `evalkit:run:${runId}`,
        evalId: 'echo',
        matrix: { id: 'benchmark', cellKey: 'echo-glm-with' },
        parameters: { model: 'glm', mode: 'with', turnBudget: 6 },
        startedAt: '2026-01-01T00:00:00.000Z',
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
    const detail = (await (await fetch(`${url}/v1/runs/${runId}`)).json()) as {
      summary: { status: string };
    };
    expect(detail.summary.status).toBe('running');
    const session = async () =>
      (await (await fetch(`${url}/v1/runs/${runId}/transcript`)).json()) as {
        transcript: { records: unknown[] } | null;
        subagents: Record<string, unknown>;
        runEvents: unknown[];
      };
    expect(await session()).toEqual({
      transcript: null,
      subagents: {},
      runEvents: [],
    });
    // A running run's transcript is read up to its last complete line.
    const header = {
      type: 'transcript',
      atxf: '0.1',
      id: runId,
      time: '2026-01-01T00:00:00.000Z',
      source: { agent: 'echo' },
    };
    const message = {
      type: 'message',
      id: 'r1',
      parentId: null,
      time: '2026-01-01T00:00:01.000Z',
      role: 'user',
      content: 'hi',
    };
    await writeFile(
      join(runDir, 'transcript.atxf.jsonl'),
      `${JSON.stringify(header)}\n${JSON.stringify(message)}\n{"type":"mess`,
    );
    expect((await session()).transcript?.records).toEqual([message]);
    await writeFile(join(runDir, 'summary.json'), '{broken json');
    expect((await fetch(`${url}/v1/runs`)).status).toBe(500);
    await writeFile(
      join(runDir, 'summary.json'),
      JSON.stringify({
        status: 'passed',
        endedAt: '2026-01-01T00:00:02.000Z',
        scoring: { results: [], passed: true },
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
