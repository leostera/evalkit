import { expect, test } from 'bun:test';
import type { RunSource } from '@evalkit/core';
import type { LocalRun } from './dashboard-reports.js';
import {
  checkShareServer,
  noRunsMessage,
  resolveShareHeaders,
  selectRuns,
  shareTarget,
  uploadBundle,
} from './share-command.js';

const head: RunSource = {
  repo: 'gitlab.example.com/team/evals',
  project: '',
  commit: 'a'.repeat(40),
  dirty: false,
};
const run = (id: string, extra: Partial<LocalRun> = {}): LocalRun => ({
  id,
  evalId: 'greeting',
  status: 'passed',
  startedAt: '2026-10-28T00:00:00Z',
  completedTrials: 1,
  requestedTrials: 1,
  source: head,
  ...extra,
});

test('share selects committed, current, unarchived runs at HEAD', () => {
  const runs = [
    run('head'),
    run('untracked', { source: undefined }),
    run('older', { source: { ...head, commit: 'b'.repeat(40) } }),
    run('other-project', { source: { ...head, project: 'other' } }),
    run('dirty', { source: { ...head, dirty: true } }),
    run('archived', { archived: true }),
    run('running', { status: 'running' }),
  ];
  const selection = selectRuns(runs, head, {});
  expect(selection.selected.map((entry) => entry.id)).toEqual(['head']);
  expect(selection).toMatchObject({
    untracked: 1,
    otherCommits: 2,
    dirty: 1,
    archived: 1,
    running: 1,
  });
  expect(
    selectRuns(runs, head, { all: true, allowDirty: true }).selected.map(
      (entry) => entry.id,
    ),
  ).toEqual(['head', 'older', 'other-project', 'dirty']);
});

test('nothing to share says why', () => {
  const none = selectRuns([run('running', { status: 'running' })], head, {});
  expect(noRunsMessage(none, head, {})).toContain('still running');
});

test('the share URL names the commit only when one commit was shared', () => {
  const server = 'https://evals.example.com';
  expect(shareTarget(server, head, [{ source: head }])).toBe(
    `${server}/gitlab.example.com/team/evals/-/${head.commit}`,
  );
  expect(
    shareTarget(server, head, [
      { source: head },
      { source: { ...head, commit: 'b'.repeat(40) } },
    ]),
  ).toBe(`${server}/gitlab.example.com/team/evals`);
});

test('uploads retry server errors but not rejections', async () => {
  let calls = 0;
  const responses: Response[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: () => {
      calls += 1;
      return responses.shift() ?? new Response('none', { status: 500 });
    },
  });
  try {
    const url = `http://localhost:${server.port}`;
    const bundle = new Uint8Array([1]);
    responses.push(
      new Response('busy', { status: 503 }),
      Response.json({ status: 'created', url: 'x' }, { status: 201 }),
    );
    expect(await uploadBundle(url, bundle, { delayMs: 1 })).toEqual({
      status: 'created',
      url: 'x',
    });
    expect(calls).toBe(2);

    calls = 0;
    responses.push(new Response('bad bundle', { status: 400 }));
    await expect(uploadBundle(url, bundle, { delayMs: 1 })).rejects.toThrow(
      'rejected the upload: bad bundle',
    );
    expect(calls).toBe(1);
  } finally {
    server.stop(true);
  }
});

test('share.headers may be an object or a function, called once and checked', async () => {
  expect(await resolveShareHeaders(undefined)).toEqual({});
  expect(await resolveShareHeaders({ 'x-token': 'a' })).toEqual({
    'x-token': 'a',
  });
  let calls = 0;
  const provider = async () => {
    calls += 1;
    return { 'cf-access-token': 'jwt' };
  };
  expect(await resolveShareHeaders(provider)).toEqual({
    'cf-access-token': 'jwt',
  });
  expect(calls).toBe(1);
  await expect(
    resolveShareHeaders(() => {
      throw new Error('not logged in');
    }),
  ).rejects.toThrow('share.headers failed: not logged in');
  await expect(
    resolveShareHeaders(() => ({ token: 42 }) as never),
  ).rejects.toThrow('"token" must be a non-empty string');
});

test('an auth proxy in front of the server is reported, and headers are sent', async () => {
  const seen: (string | null)[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const token = request.headers.get('cf-access-token');
      seen.push(token);
      if (!token)
        return new Response(null, {
          status: 302,
          headers: { location: 'https://team.cloudflareaccess.com/login' },
        });
      return Response.json({ repos: [] });
    },
  });
  try {
    const url = `http://localhost:${server.port}`;
    await expect(checkShareServer(url, {})).rejects.toThrow(
      'redirected to team.cloudflareaccess.com instead of answering. If an auth proxy is in front of the share server, set share.headers',
    );
    await expect(
      uploadBundle(url, new Uint8Array([1]), { delayMs: 1 }),
    ).rejects.toThrow('redirected to team.cloudflareaccess.com');
    await checkShareServer(url, { 'cf-access-token': 'jwt' });
    expect(seen).toEqual([null, null, 'jwt']);
  } finally {
    server.stop(true);
  }
});

test('an HTML page answering an upload is not mistaken for success', async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response('<html>login</html>', {
        headers: { 'content-type': 'text/html' },
      }),
  });
  try {
    await expect(
      uploadBundle(`http://localhost:${server.port}`, new Uint8Array([1]), {
        delayMs: 1,
      }),
    ).rejects.toThrow(
      'did not answer as an EvalKit share server (200, text/html)',
    );
  } finally {
    server.stop(true);
  }
});
