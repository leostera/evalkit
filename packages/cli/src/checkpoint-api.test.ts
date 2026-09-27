import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dashboard and CLI must use the same runner and v3 report semantics. */
test('dashboard exposes checkpoint failure and skipped steps for a launched eval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-checkpoint-api-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  await mkdir(join(root, 'evals'));
  await writeFile(
    join(root, 'evals', 'steps.eval.js'),
    `
    export default {
      id: 'steps',
      agent: { async start({ onEvent }) { return {
        async send() { await onEvent({ kind: 'message', role: 'assistant', content: 'short', timestamp: new Date().toISOString() }); },
        async close() {},
      }; } },
      transcript: [
        { kind: 'user', message: 'hello' },
        { kind: 'predicate', name: 'long-reply', run: ({ turn }) => (turn.lastAssistantText?.length ?? 0) >= 10 },
        { kind: 'user', message: 'this must not run' },
      ],
      scoring: [], policy: { failfast: true },
    };
  `,
  );
  const cli = fileURLToPath(new URL('./index.ts', import.meta.url));
  const child = Bun.spawn([process.execPath, cli, 'serve-dashboard'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), EVALKIT_NO_OPEN: '1' },
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`${base}/v1/catalog`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* startup */
      }
      await Bun.sleep(50);
    }
    expect(ready).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: 'steps' }),
        })
      ).status,
    ).toBe(202);
    let runs: Array<{ id: string; status: string }> = [];
    for (let i = 0; i < 100; i++) {
      runs = (await (await fetch(`${base}/v1/runs`)).json()).runs;
      if (runs[0]?.status === 'failed') break;
      await Bun.sleep(50);
    }
    expect(runs[0]?.status).toBe('failed');
    const runId = runs[0]!.id;
    const trials = (
      await (await fetch(`${base}/v1/runs/${runId}/trials`)).json()
    ).trials;
    expect(trials[0]).toMatchObject({
      status: 'failed',
      checkpoints: [{ step: 1, status: 'failed', value: 0 }],
    });
    const events = (
      await (
        await fetch(`${base}/v1/runs/${runId}/trials/${trials[0].id}/events`)
      ).json()
    ).events;
    expect(
      events.some(
        (event: { kind: string }) => event.kind === 'transcript-step-skipped',
      ),
    ).toBe(true);
    const detail = (
      await (
        await fetch(`${base}/v1/runs/${runId}/trials/${trials[0].id}`)
      ).json()
    ).summary;
    expect(detail).toMatchObject({
      status: 'completed',
      scoring: { passed: false },
    });
  } finally {
    child.kill();
    await child.exited;
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
