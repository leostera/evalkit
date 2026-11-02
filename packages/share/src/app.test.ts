import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShareApp, type ShareEvent } from './app.js';
import { encodeBundle, type BundleFile } from './bundle.js';
import { directoryFiles } from './fs-files.js';
import { sqliteIndex } from './index-sqlite.js';
import { allowedLegacyRunPath, allowedRunPath } from './paths.js';

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
  const index = await sqliteIndex(join(root, 'index.sqlite'));
  const app = createShareApp({
    log: (event) => events.push(event),
    files,
    index,
    assets: {
      index: async () => TEMPLATE,
      get: async (path) =>
        path === 'app.js' ? new Response('/* app */') : null,
    },
  });
  const request = (path: string, init?: RequestInit) =>
    app.request(`http://share.test${path}`, init);
  return { root, files, index, request, events };
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
    snapshotVersion: 2,
    id: overrides.id ?? crypto.randomUUID(),
    evalId: 'greeting',
    status: overrides.status ?? 'passed',
    startedAt: '2026-10-28T10:00:00.000Z',
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
  return encodeBundle([
    { path: 'run.json', data: json(summary) },
    { path: 'catalog.json', data: json(catalog) },
    { path: 'detail.json', data: json({ ok: true }) },
    {
      path: 'workspace/out/reply.html',
      data: new TextEncoder().encode('<script>alert(1)</script>'),
    },
    ...extra,
  ]);
}

/** A run of trials as EvalKit 0.8 uploaded it (snapshot format version 1). */
function legacyFiles(
  runId: string,
  trials: { id: string; status: string }[],
): BundleFile[] {
  const { snapshotVersion: _version, ...summary } = run({ id: runId });
  return [
    {
      path: 'run.json',
      data: json({ ...summary, completedTrials: trials.length }),
    },
    {
      path: 'catalog.json',
      data: json({
        catalog: [{ id: 'greeting', trialCount: 2, policy: { trials: 2 } }],
        evals: [],
        suites: [],
      }),
    },
    {
      path: 'trials.json',
      data: json({
        trials: trials.map((trial, index) => ({
          id: trial.id,
          index,
          status: trial.status,
          startedAt: '2026-10-28T10:00:00.000Z',
          score: trial.status === 'passed' ? 1 : 0,
          scores: [
            { name: 'greets', kind: 'predicate', value: 1, durationMs: 1 },
          ],
          checkpoints: [],
        })),
      }),
    },
    ...trials.flatMap((trial) => [
      {
        path: `trials/${trial.id}/detail.json`,
        data: json({
          manifest: {
            schemaVersion: 5,
            evalId: 'greeting',
            startedAt: '2026-10-28T10:00:00.000Z',
          },
          summary: { status: 'completed', scoring: { passed: true } },
        }),
      },
      {
        path: `trials/${trial.id}/events.json`,
        data: json({
          events: [{ source: 'runner', kind: 'trial-started', timestamp: 'x' }],
        }),
      },
      {
        path: `trials/${trial.id}/workspace/main.ml`,
        data: new TextEncoder().encode('()'),
      },
    ]),
  ];
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
    { event: 'share.upload', outcome: 'created', runId: summary.id, files: 2 },
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
  expect(
    await (await request(`${data}/runs/${summary.id}/detail.json`)).json(),
  ).toEqual({ ok: true });

  // Candidate files are untrusted: never rendered on this origin.
  const file = await request(
    `${data}/runs/${summary.id}/workspace/out/reply.html`,
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
      await bundleFor(run(), [{ path: 'evaluator/secret.txt', data: json(1) }]),
    ],
    [
      'path escape',
      await bundleFor(run(), [{ path: 'workspace/../../x', data: json(1) }]),
    ],
    [
      'old layout in a new bundle',
      await bundleFor(run(), [{ path: 'trials.json', data: json({}) }]),
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
    index: await sqliteIndex(join(root, 'fresh.sqlite')),
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
  for (const path of [
    'run.json',
    'catalog.json',
    'detail.json',
    'events.json',
    'workspace/deep/file.txt',
    'attachments/logs/agent.log',
  ])
    expect([path, allowedRunPath(path)]).toEqual([path, true]);
  for (const path of [
    'summary.json',
    'trials.json',
    'scoring.json',
    'workspace/../x',
    'workspace//x',
    'evaluator/x',
    'attachments/../manifest.json',
  ])
    expect([path, allowedRunPath(path)]).toEqual([path, false]);
  // Uploads from EvalKit before 0.9 use the old layout, converted on arrival.
  const trial = '9c67c094-94cd-4bfc-9ddf-b48b813e4331';
  for (const path of [
    'trials.json',
    `trials/${trial}/events.json`,
    `trials/${trial}/workspace/deep/file.txt`,
  ])
    expect([path, allowedLegacyRunPath(path)]).toEqual([path, true]);
  for (const path of [
    `trials/not-a-uuid/events.json`,
    `trials/${trial}/scoring.json`,
    `trials/${trial}/evaluator/x`,
  ])
    expect([path, allowedLegacyRunPath(path)]).toEqual([path, false]);
});

test('an upload from an older CLI becomes one run per finished trial', async () => {
  const { request } = await server();
  const oldRun = crypto.randomUUID();
  const [a, b, c] = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  const response = await upload(
    request,
    await encodeBundle(
      legacyFiles(oldRun, [
        { id: a!, status: 'passed' },
        { id: b!, status: 'failed' },
        { id: c!, status: 'cancelled' },
      ]),
    ),
  );
  expect(response.status).toBe(201);
  const data = `/api/v1/repos/${REPO}/-/${SHA_A}/data`;
  const runs = (
    (await (await request(`${data}/runs.json`)).json()) as {
      runs: { id: string; status: string; batch?: unknown }[];
    }
  ).runs;
  // The cancelled trial is not a shareable run.
  expect(runs.map((entry) => entry.id).sort()).toEqual([a, b].sort());
  expect(runs.find((entry) => entry.id === b)).toMatchObject({
    snapshotVersion: 2,
    status: 'failed',
    batch: { id: oldRun, index: 1, size: 3 },
  });
  const events = (await (
    await request(`${data}/runs/${a}/events.json`)
  ).json()) as { events: { kind: string }[] };
  expect(events.events[0]!.kind).toBe('run-started');
  expect(
    await (await request(`${data}/runs/${a}/workspace/main.ml`)).text(),
  ).toBe('()');
  expect(
    (await (await request(`${data}/catalog.json`)).json()) as unknown,
  ).toEqual({ evals: [{ id: 'greeting', repeat: 2, policy: {} }] });
});

test('upgrade converts stored runs from before 0.9, a bounded number at a time', async () => {
  const { request, files, index, events } = await server();
  const base = `repos/${REPO}/commits/${SHA_A}`;
  const store = async (runId: string, trials: string[]) => {
    for (const file of legacyFiles(
      runId,
      trials.map((id) => ({ id, status: 'passed' })),
    ))
      await files.put(
        file.path === 'catalog.json'
          ? `${base}/catalog.json`
          : `${base}/runs/${runId}/${file.path}`,
        file.data,
      );
    const { snapshotVersion: _v, ...summary } = run({ id: runId });
    await index.recordRun({
      id: runId,
      evalId: 'greeting',
      status: 'passed',
      startedAt: summary.startedAt,
      source: { ...summary.source, ref: 'main' },
      repoKey: REPO,
      summary,
    });
  };
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const trials = [crypto.randomUUID(), crypto.randomUUID()];
  await store(first, trials);
  await store(second, [crypto.randomUUID()]);

  const step = await request('/api/v1/upgrade?limit=1', { method: 'POST' });
  expect(await step.json()).toMatchObject({ upgraded: 1, remaining: 1 });
  const rest = await request('/api/v1/upgrade', { method: 'POST' });
  expect(await rest.json()).toMatchObject({ upgraded: 1, remaining: 0 });
  expect(
    await (await request('/api/v1/upgrade', { method: 'POST' })).json(),
  ).toEqual({ upgraded: 0, runs: 0, remaining: 0 });
  expect(
    events.filter((event) => event.event === 'share.upgrade'),
  ).toHaveLength(3);

  const runs = (
    (await (
      await request(`/api/v1/repos/${REPO}/-/${SHA_A}/data/runs.json`)
    ).json()) as { runs: { id: string }[] }
  ).runs;
  expect(runs).toHaveLength(3);
  expect(runs.map((entry) => entry.id)).not.toContain(first);
  expect(runs.map((entry) => entry.id)).toContain(trials[0]);
  // A run of one trial keeps its ID, so its links keep working.
  expect(runs.map((entry) => entry.id)).toContain(second);
  const kept: string[] = [];
  for await (const key of files.list(`${base}/runs/${second}/`)) kept.push(key);
  expect(kept.some((key) => key.includes('/trials'))).toBe(false);
  expect(kept).toContain(`${base}/runs/${second}/detail.json`);
  expect(
    await (
      await request(
        `/api/v1/repos/${REPO}/-/${SHA_A}/data/runs/${second}/workspace/main.ml`,
      )
    ).text(),
  ).toBe('()');
  const commits = (await (
    await request(`/api/v1/repos/${REPO}/-/commits`)
  ).json()) as { commits: { runs: number; passed: number }[] };
  expect(commits.commits[0]).toMatchObject({ runs: 3, passed: 3 });
  // The old objects are gone.
  const left: string[] = [];
  for await (const key of files.list(`${base}/runs/${first}/`)) left.push(key);
  expect(left).toEqual([]);
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
