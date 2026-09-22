import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

const fixture = fileURLToPath(
  new URL('../test-fixtures/control-api.worker.ts', import.meta.url),
);

let miniflare: Miniflare | undefined;
let buildDirectory: string | undefined;

afterEach(async () => {
  await miniflare?.dispose();
  miniflare = undefined;
  if (buildDirectory)
    await rm(buildDirectory, { force: true, recursive: true });
  buildDirectory = undefined;
});

async function startWorker(): Promise<Miniflare> {
  buildDirectory = await mkdtemp(join(tmpdir(), 'evalkit-miniflare-'));
  const build = await Bun.build({
    entrypoints: [fixture],
    format: 'esm',
    outdir: buildDirectory,
    packages: 'bundle',
    target: 'browser',
  });
  if (!build.success) {
    throw new Error(build.logs.map((log) => log.message).join('\n'));
  }

  const entrypoint = build.outputs.find(
    (output) => output.kind === 'entry-point',
  );
  if (!entrypoint) throw new Error('Worker build did not emit an entrypoint');

  miniflare = new Miniflare({
    bindings: { EVALKIT_API_TOKEN: 'miniflare-token' },
    modules: true,
    modulesRoot: buildDirectory,
    scriptPath: entrypoint.path,
  });
  return miniflare;
}

describe('control API (Miniflare E2E)', () => {
  test('enforces Worker-secret authentication in workerd', async () => {
    const worker = await startWorker();

    const unauthorized = await worker.dispatchFetch(
      'https://evalkit.test/v1/evals',
    );
    const authorized = await worker.dispatchFetch(
      'https://evalkit.test/v1/evals',
      {
        headers: { authorization: 'Bearer miniflare-token' },
      },
    );

    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({
      error: { code: 'unauthorized' },
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({
      evals: [{ id: 'miniflare-example' }],
    });
  });
});
