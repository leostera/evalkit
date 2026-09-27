import { expect, test } from 'bun:test';
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('dashboard rejects unselected matrix runs and persists one selected cell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-dashboard-matrix-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  await mkdir(join(root, 'evals'));
  await writeFile(
    join(root, 'evalkit.config.js'),
    "export default { matrix: { id: 'benchmark', parameters: { model: ['glm', 'scout'], mode: ['with-docs', 'without-docs'] } }, execution: { trials: 3 } };\n",
  );
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
  const submit = (body: unknown) =>
    fetch(`${url}/v1/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        ready = (await fetch(`${url}/v1/matrix`)).ok;
        if (ready) break;
      } catch {
        /* startup */
      }
      await Bun.sleep(50);
    }
    expect(ready).toBe(true);
    expect(await (await fetch(`${url}/v1/matrix`)).json()).toEqual({
      matrix: {
        id: 'benchmark',
        parameters: {
          model: ['glm', 'scout'],
          mode: ['with-docs', 'without-docs'],
        },
        trials: 3,
      },
    });
    for (const body of [
      { path: 'echo' },
      { path: 'echo', parameters: { model: 'glm' } },
      { path: 'echo', parameters: { model: 'unknown', mode: 'with-docs' } },
    ]) {
      expect((await submit(body)).status).toBe(400);
    }
    expect(
      (await fetch(`${url}/v1/suites/anything/runs`, { method: 'POST' }))
        .status,
    ).toBe(400);
    expect(
      (
        await submit({
          path: 'echo',
          parameters: { model: 'glm', mode: 'with-docs' },
        })
      ).status,
    ).toBe(202);
    let manifests: string[] = [];
    let manifestText: string | undefined;
    const reportDir = join(root, '_evalkit-results');
    for (let i = 0; i < 100; i++) {
      manifests = await readdir(reportDir).catch(() => []);
      if (manifests.length === 1)
        manifestText = await readFile(
          join(reportDir, manifests[0]!, 'manifest.json'),
          'utf8',
        ).catch(() => undefined);
      if (manifestText) break;
      await Bun.sleep(50);
    }
    expect(manifests).toHaveLength(1);
    expect(manifestText).toBeDefined();
    const manifest = JSON.parse(manifestText!) as {
      parameters: Record<string, unknown>;
      matrix?: { id: string };
    };
    expect(manifest.parameters).toMatchObject({
      model: 'glm',
      mode: 'with-docs',
    });
    expect(manifest.matrix?.id).toBe('benchmark');
    const listed = (await (await fetch(`${url}/v1/runs`)).json()) as {
      runs: Array<{ matrixId?: string; parameters?: Record<string, unknown> }>;
    };
    expect(listed.runs[0]).toMatchObject({
      matrixId: 'benchmark',
      parameters: { model: 'glm', mode: 'with-docs' },
    });
  } finally {
    child.kill();
    await child.exited;
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
