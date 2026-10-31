import { afterEach, expect, test } from 'bun:test';
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defineAgent,
  defineEval,
  predicate,
  user,
  type TrialWriter,
} from '@evalkit/core';
import { Effect } from 'effect';
import { excludeMatcher, snapshotCandidateWorkspace } from './snapshot.js';
import { localReportStore, runEval } from './index.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-snapshot-'));
  roots.push(root);
  return root;
}

test('exclude patterns: bare names match at any depth, paths match from the root', () => {
  const excluded = excludeMatcher(['_build', 'docs/drafts', '*.log']);
  expect(excluded('_build')).toBe(true);
  expect(excluded('hello/_build')).toBe(true);
  expect(excluded('hello/build.ml')).toBe(false);
  expect(excluded('docs/drafts')).toBe(true);
  expect(excluded('other/docs/drafts')).toBe(false);
  expect(excluded('logs/run.log')).toBe(true);
});

test('snapshots skip excluded paths and symbolic links instead of failing', async () => {
  const root = await directory();
  await mkdir(join(root, 'hello/_build/default'), { recursive: true });
  await writeFile(join(root, 'hello/main.ml'), 'let () = print_endline "hi"');
  await writeFile(join(root, 'hello/_build/default/main.exe'), 'binary');
  await symlink('/etc/hosts', join(root, 'hello/hosts'));
  const written: string[] = [];
  const writer = {
    writeArtifact: async (path: string) => {
      written.push(path);
    },
  } as unknown as TrialWriter;
  const artifacts = await snapshotCandidateWorkspace(root, writer);
  expect(written).toEqual(['candidate/hello/main.ml']);
  expect(artifacts.map((entry) => entry.path)).toEqual([
    'candidate/hello',
    'candidate/hello/main.ml',
  ]);
});

test('persistent workspaces are kept only for trials that did not pass, by default', async () => {
  const root = await directory();
  const sandbox = join(root, 'sandbox');
  const scenario = (passes: boolean) =>
    defineEval({
      id: passes ? 'passes' : 'fails',
      agent: defineAgent({
        async start() {
          return { send: async () => 'ok' };
        },
      }),
      transcript: [user('go')],
      scoring: [predicate('verdict', () => passes)],
    });
  const run = (passes: boolean, keepWorkspaces?: 'all' | 'none') =>
    Effect.runPromise(
      runEval(scenario(passes), {
        report: localReportStore(join(root, 'results')),
        workspaceRoot: sandbox,
        ...(keepWorkspaces ? { keepWorkspaces } : {}),
      }),
    );
  const failed = await run(false);
  await run(true);
  expect(await readdir(sandbox)).toEqual([failed.trialId]);
  const kept = await run(true, 'all');
  expect((await readdir(sandbox)).sort()).toEqual(
    [failed.trialId, kept.trialId].sort(),
  );
  await run(false, 'none');
  expect((await readdir(sandbox)).length).toBe(2);
});
