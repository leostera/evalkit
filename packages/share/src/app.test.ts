import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShareApp, type ShareEvent } from './app.js';
import { encodeBundle, type BundleFile } from './bundle.js';
import { directoryFiles } from './fs-files.js';
import { sqliteIndex } from './index-bun.js';
import { allowedRunPath } from './paths.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const TEMPLATE =
  '<!doctype html>\n<html lang="en">\n  <head><script src="/assets/app.js"></script></head></html>';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const REPO = 'gitlab.example.com/team/evals';

async function server(options: { failWrites?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-share-'));
  roots.push(root);
  const stored = directoryFiles(join(root, 'files'));
  const files = options.failWrites
    ? {
        ...stored,
        put: async () => {
          throw new Error('disk full');
        },
      }
    : stored;
  const events: ShareEvent[] = [];
  const app = createShareApp({
    log: (event) => events.push(event),
    files,
    index: sqliteIndex(join(root, 'index.sqlite')),
    assets: {
      index: async () => TEMPLATE,
      get: async (path) =>
        path === 'app.js' ? new Response('/* app */') : null,
    },
  });
  const request = (path: string, init?: RequestInit) =>
    app.request(`http://share.test${path}`, init);
  return { root, files, request, events };
}

const json = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

function run(
  overrides: {
    id?: string;
    commit?: string;
    status?: string;
    dirty?: boolean;
    committedAt?: string;
    project?: string;
    ref?: unknown;
  } = {},
) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    evalId: 'greeting',
    status: overrides.status ?? 'passed',
    startedAt: '2026-10-28T10:00:00.000Z',
    completedTrials: 1,
    requestedTrials: 1,
    source: {
      repo: REPO,
      project: overrides.project ?? '',
      commit: overrides.commit ?? SHA_A,
      ref: 'ref' in overrides ? overrides.ref : 'main',
      committedAt: overrides.committedAt ?? '2026-10-28T09:00:00Z',
      dirty: overrides.dirty ?? false,
    },
  };
}

async function bundleFor(
  summary: ReturnType<typeof run>,
  extra: BundleFile[] = [],
  catalog: unknown = {
    catalog: [{ id: 'greeting' }],
    evals: [{ id: 'greeting' }],
    suites: [],
  },
) {
  const trial = crypto.randomUUID();
  return encodeBundle([
    { path: 'run.json', data: json(summary) },
    { path: 'catalog.json', data: json(catalog) },
    { path: 'trials.json', data: json({ trials: [{ id: trial }] }) },
    { path: `trials/${trial}/detail.json`, data: json({ ok: true }) },
    {
      path: `trials/${trial}/workspace/out/reply.html`,
      data: new TextEncoder().encode('<script>alert(1)</script>'),
    },
    ...extra,
  ]);
}

const upload = (
  request: Awaited<ReturnType<typeof server>>['request'],
  body: Uint8Array,
) => request('/api/v1/uploads', { method: 'POST', body: body as BodyInit });

test('uploads are stored, indexed, idempotent, and served with the dashboard', async () => {
  const { request, events } = await server();
  const summary = run();
  const first = await upload(request, await bundleFor(summary));
  expect(first.status).toBe(201);
  expect(await first.json()).toEqual({
    status: 'created',
    url: `http://share.test/${REPO}/-/${SHA_A}/runs/${summary.id}`,
  });
  const again = await upload(request, await bundleFor(summary));
  expect(again.status).toBe(200);
  expect((await again.json()).status).toBe('exists');
  expect(events).toMatchObject([
    { event: 'share.upload', outcome: 'created', runId: summary.id, files: 3 },
    { event: 'share.upload', outcome: 'exists', runId: summary.id },
  ]);

  expect(await (await request('/api/v1/repos')).json()).toMatchObject({
    repos: [{ key: REPO, commits: 1 }],
  });
  expect(
    await (await request(`/api/v1/repos/${REPO}/-/commits`)).json(),
  ).toMatchObject({
    commits: [{ commit: SHA_A, ref: 'main', runs: 1, passed: 1, failed: 0 }],
  });
  const data = `/api/v1/repos/${REPO}/-/${SHA_A}/data`;
  expect(await (await request(`${data}/runs.json`)).json()).toEqual({
    runs: [summary],
  });
  expect(await (await request(`${data}/catalog.json`)).json()).toEqual({
    evals: [{ id: 'greeting' }],
  });
  const trials = (await (
    await request(`${data}/runs/${summary.id}/trials.json`)
  ).json()) as { trials: { id: string }[] };
  const trial = trials.trials[0]!.id;
  expect(
    await (
      await request(`${data}/runs/${summary.id}/trials/${trial}/detail.json`)
    ).json(),
  ).toEqual({ ok: true });

  // Candidate files are untrusted: never rendered on this origin.
  const file = await request(
    `${data}/runs/${summary.id}/trials/${trial}/workspace/out/reply.html`,
  );
  expect(file.headers.get('content-type')).toBe('application/octet-stream');
  expect(file.headers.get('content-security-policy')).toBe('sandbox');
  expect(file.headers.get('x-content-type-options')).toBe('nosniff');

  // Pages: the dashboard, told where this commit's data lives.
  const page = await (await request(`/${REPO}/-/${SHA_A}/runs`)).text();
  expect(page).toContain(`<base href="/${REPO}/-/${SHA_A}/" />`);
  expect(page).toContain('data-evalkit-share=');
  expect(page).toContain(`/api/v1/repos/${REPO}/-/${SHA_A}/`);
  expect(page).toContain('"/assets/app.js"');
  expect(await (await request('/assets/app.js')).text()).toBe('/* app */');
});

test('short SHAs, refs, and bare repositories redirect to a full commit', async () => {
  const { request } = await server();
  await upload(
    request,
    await bundleFor(
      run({ commit: SHA_A, committedAt: '2026-10-01T00:00:00Z' }),
    ),
  );
  await upload(
    request,
    await bundleFor(
      run({ commit: SHA_B, committedAt: '2026-10-02T00:00:00Z' }),
    ),
  );
  const location = async (path: string) =>
    (await request(path)).headers.get('location');
  expect(await location(`/${REPO}`)).toBe(`/${REPO}/-/${SHA_B}/`);
  expect(await location(`/${REPO}/-/main/runs?x=1`)).toBe(
    `/${REPO}/-/${SHA_B}/runs?x=1`,
  );
  expect(await location(`/${REPO}/-/aaaaaaa/suites`)).toBe(
    `/${REPO}/-/${SHA_A}/suites`,
  );
  const missing = await request(`/${REPO}/-/nope`);
  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain(
    '&quot;missing&quot;:&quot;nope&quot;',
  );
  expect((await request('/')).status).toBe(200);
});

test('dirty runs are shown but excluded from commit results; projects get their own key', async () => {
  const { request } = await server();
  await upload(request, await bundleFor(run({ status: 'failed' })));
  await upload(
    request,
    await bundleFor(run({ dirty: true, status: 'passed' })),
  );
  await upload(request, await bundleFor(run({ project: 'evals' })));
  const commits = (await (
    await request(`/api/v1/repos/${REPO}/-/commits`)
  ).json()) as { commits: { runs: number; passed: number; failed: number }[] };
  expect(commits.commits[0]).toMatchObject({ runs: 1, passed: 0, failed: 1 });
  const runs = (await (
    await request(`/api/v1/repos/${REPO}/-/${SHA_A}/data/runs.json`)
  ).json()) as { runs: unknown[] };
  expect(runs.runs).toHaveLength(2);
  const repos = (await (await request('/api/v1/repos')).json()) as {
    repos: { key: string }[];
  };
  expect(repos.repos.map((repo) => repo.key).sort()).toEqual([
    REPO,
    `${REPO}/~evals`,
  ]);
});

test('concurrent uploads for one commit keep every run', async () => {
  const { request } = await server();
  const summaries = Array.from({ length: 12 }, () => run());
  await Promise.all(
    summaries.map(async (summary) => upload(request, await bundleFor(summary))),
  );
  const runs = (await (
    await request(`/api/v1/repos/${REPO}/-/${SHA_A}/data/runs.json`)
  ).json()) as { runs: unknown[] };
  expect(runs.runs).toHaveLength(12);
  const commits = (await (
    await request(`/api/v1/repos/${REPO}/-/commits`)
  ).json()) as { commits: { runs: number }[] };
  expect(commits.commits[0]!.runs).toBe(12);
});

test('invalid bundles are rejected without storing anything', async () => {
  const { request, files, events } = await server();
  const cases: [string, Uint8Array][] = [
    ['not gzip', new TextEncoder().encode('hello')],
    [
      'evaluator file',
      await bundleFor(run(), [
        {
          path: `trials/${crypto.randomUUID()}/evaluator/secret.txt`,
          data: json(1),
        },
      ]),
    ],
    [
      'path escape',
      await bundleFor(run(), [
        {
          path: `trials/${crypto.randomUUID()}/workspace/../../x`,
          data: json(1),
        },
      ]),
    ],
    [
      'no source',
      await encodeBundle([
        { path: 'run.json', data: json({ id: crypto.randomUUID() }) },
      ]),
    ],
    ['short sha', await bundleFor(run({ commit: 'abc' }))],
    // A running run's files would be cached as immutable and never completed.
    ['running run', await bundleFor(run({ status: 'running' }))],
    ['non-string ref', await bundleFor(run({ ref: 42 }))],
    ['bad catalog', await bundleFor(run(), [], { evals: 'nope' })],
  ];
  for (const [name, body] of cases) {
    const response = await upload(request, body);
    expect([name, response.status]).toEqual([name, 400]);
  }
  const stored: string[] = [];
  for await (const key of files.list('')) stored.push(key);
  expect(stored).toEqual([]);
  expect(
    events.map(
      (event) => event.event + ':' + ('outcome' in event ? event.outcome : ''),
    ),
  ).toEqual(cases.map(() => 'share.upload:rejected'));
});

test('reindex rebuilds the index from stored run.json files', async () => {
  const { root, request } = await server();
  const summary = run();
  await upload(request, await bundleFor(summary));
  // A fresh index over the same files, as after losing the Durable Object.
  const app = createShareApp({
    files: directoryFiles(join(root, 'files')),
    index: sqliteIndex(join(root, 'fresh.sqlite')),
    assets: { index: async () => TEMPLATE, get: async () => null },
  });
  const before = await app.request(`http://share.test/api/v1/repos`);
  expect(((await before.json()) as { repos: unknown[] }).repos).toEqual([]);
  const reindex = await app.request('http://share.test/api/v1/reindex', {
    method: 'POST',
  });
  expect(await reindex.json()).toEqual({ runs: 1, indexed: 1 });
  const runs = await app.request(
    `http://share.test/api/v1/repos/${REPO}/-/${SHA_A}/data/runs.json`,
  );
  expect(await runs.json()).toEqual({ runs: [summary] });
});

test('run bundle paths are limited to the snapshot format', () => {
  const trial = '9c67c094-94cd-4bfc-9ddf-b48b813e4331';
  for (const path of [
    'run.json',
    'catalog.json',
    'trials.json',
    `trials/${trial}/events.json`,
    `trials/${trial}/workspace/deep/file.txt`,
  ])
    expect([path, allowedRunPath(path)]).toEqual([path, true]);
  for (const path of [
    'summary.json',
    `trials/not-a-uuid/events.json`,
    `trials/${trial}/scoring.json`,
    `trials/${trial}/workspace/../x`,
    `trials/${trial}/workspace//x`,
    `trials/${trial}/evaluator/x`,
  ])
    expect([path, allowedRunPath(path)]).toEqual([path, false]);
});

test('server errors are logged once and answered without details', async () => {
  const { request, events } = await server({ failWrites: true });
  const response = await upload(request, await bundleFor(run()));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Internal error' });
  expect(events).toEqual([
    {
      event: 'share.error',
      method: 'POST',
      path: '/api/v1/uploads',
      error: 'disk full',
    },
  ]);
});
