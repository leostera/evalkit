import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { encodeBundle } from './bundle.js';

/** The share Worker in workerd: R2 for files, a SQLite Durable Object for the index. */
let miniflare: Miniflare;
let buildDirectory: string;
const SHA = 'c'.repeat(40);
const REPO = 'gitlab.example.com/team/evals';

beforeAll(async () => {
  buildDirectory = await mkdtemp(join(tmpdir(), 'evalkit-share-worker-'));
  const build = await Bun.build({
    entrypoints: [new URL('./worker.ts', import.meta.url).pathname],
    format: 'esm',
    outdir: buildDirectory,
    target: 'browser',
  });
  if (!build.success)
    throw new Error(build.logs.map((log) => log.message).join('\n'));
  const entry = build.outputs.find((output) => output.kind === 'entry-point')!;
  miniflare = new Miniflare({
    modules: true,
    modulesRoot: buildDirectory,
    scriptPath: entry.path,
    compatibilityDate: '2025-04-01',
    r2Buckets: ['RESULTS'],
    durableObjects: { INDEX: { className: 'ShareIndex', useSQLite: true } },
    serviceBindings: {
      ASSETS: async (request: { url: string }) =>
        new URL(request.url).pathname === '/'
          ? new Response(
              '<!doctype html>\n<html lang="en"><head><script src="/assets/a.js"></script></head></html>',
            )
          : new Response('missing', { status: 404 }),
    },
  });
}, 60_000);

afterAll(async () => {
  await miniflare?.dispose();
  await rm(buildDirectory, { recursive: true, force: true });
});

test('uploads are stored in R2, indexed in the Durable Object, and served', async () => {
  const id = crypto.randomUUID();
  const summary = {
    id,
    evalId: 'greeting',
    status: 'passed',
    startedAt: '2026-10-28T10:00:00.000Z',
    source: { repo: REPO, project: '', commit: SHA, ref: 'main', dirty: false },
  };
  const encode = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value));
  const body = await encodeBundle([
    { path: 'run.json', data: encode(summary) },
    {
      path: 'catalog.json',
      data: encode({ catalog: [], evals: [], suites: [] }),
    },
    { path: 'trials.json', data: encode({ trials: [] }) },
  ]);
  const created = await miniflare.dispatchFetch(
    'http://share.test/api/v1/uploads',
    { method: 'POST', body },
  );
  expect(created.status).toBe(201);
  const again = await miniflare.dispatchFetch(
    'http://share.test/api/v1/uploads',
    { method: 'POST', body },
  );
  expect(((await again.json()) as { status: string }).status).toBe('exists');

  const commits = await miniflare.dispatchFetch(
    `http://share.test/api/v1/repos/${REPO}/-/commits`,
  );
  expect(await commits.json()).toMatchObject({
    commits: [{ commit: SHA, runs: 1, passed: 1 }],
  });
  const runs = await miniflare.dispatchFetch(
    `http://share.test/api/v1/repos/${REPO}/-/${SHA}/data/runs.json`,
  );
  expect(await runs.json()).toEqual({ runs: [summary] });
  const bucket = (await miniflare.getR2Bucket('RESULTS')) as unknown as {
    get(key: string): Promise<unknown>;
  };
  expect(
    await bucket.get(`repos/${REPO}/commits/${SHA}/runs/${id}/run.json`),
  ).not.toBeNull();

  const redirect = await miniflare.dispatchFetch(`http://share.test/${REPO}`, {
    redirect: 'manual',
  });
  expect(redirect.headers.get('location')).toBe(`/${REPO}/-/${SHA}/`);
  const page = await miniflare.dispatchFetch(
    `http://share.test/${REPO}/-/${SHA}/runs`,
  );
  expect(await page.text()).toContain(`<base href="/${REPO}/-/${SHA}/" />`);
}, 30_000);
