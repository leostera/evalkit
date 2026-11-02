import { afterEach, expect, test } from 'bun:test';
import type { RunResult } from '@evalkit/core';
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
  type RunWriter,
} from '@evalkit/core';
import { Effect } from 'effect';
import { ignoreRules, snapshotCandidateWorkspace } from './snapshot.js';
import { localReportStore, runEval } from './index.js';

/** Runs a scenario once and returns its one run. */
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

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

test('ignore patterns: bare names match at any depth, paths match from the root', () => {
  const rules = ignoreRules(['_build', 'docs/drafts', '*.log']);
  expect(rules.ignored('_build')).toBe(true);
  expect(rules.ignored('hello/_build')).toBe(true);
  expect(rules.ignored('hello/build.ml')).toBe(false);
  expect(rules.ignored('docs/drafts')).toBe(true);
  expect(rules.ignored('other/docs/drafts')).toBe(false);
  expect(rules.ignored('logs/run.log')).toBe(true);
});

test('ignore patterns: later patterns win, and ! re-includes below an ignored directory', () => {
  const rules = ignoreRules([
    '_build',
    '!_build/doc/**',
    '_build/doc/**/*.tmp',
  ]);
  expect(rules.ignored('_build')).toBe(true);
  expect(rules.ignored('_build/default/main.exe', true)).toBe(true);
  expect(rules.ignored('_build/doc/index.html', true)).toBe(false);
  expect(rules.ignored('_build/doc/x.tmp', true)).toBe(true);
  expect(rules.mayReinclude('_build')).toBe(true);
  expect(rules.mayReinclude('_build/doc')).toBe(true);
  expect(rules.mayReinclude('_build/default')).toBe(false);
  expect(rules.mayReinclude('node_modules')).toBe(false);
  // A path inherits its directory's state unless a pattern says otherwise.
  expect(rules.ignored('src/main.ml', false)).toBe(false);
  expect(ignoreRules(['!keep']).mayReinclude('anything')).toBe(true);
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
  } as unknown as RunWriter;
  const artifacts = await snapshotCandidateWorkspace(root, writer);
  expect(written).toEqual(['candidate/hello/main.ml']);
  expect(artifacts.map((entry) => entry.path)).toEqual([
    'candidate/hello',
    'candidate/hello/main.ml',
  ]);
});

test('snapshots walk an ignored directory only to keep re-included files', async () => {
  const root = await directory();
  await mkdir(join(root, 'app/_build/doc/geometry'), { recursive: true });
  await mkdir(join(root, 'app/_build/default'), { recursive: true });
  await mkdir(join(root, 'node_modules/dep'), { recursive: true });
  await writeFile(join(root, 'app/main.ml'), 'let () = ()');
  await writeFile(
    join(root, 'app/_build/doc/geometry/index.html'),
    '<h1>docs</h1>',
  );
  await writeFile(join(root, 'app/_build/default/main.exe'), 'binary');
  await writeFile(join(root, 'node_modules/dep/index.js'), '');
  const written: string[] = [];
  const writer = {
    writeArtifact: async (path: string) => {
      written.push(path);
    },
  } as unknown as RunWriter;
  const artifacts = await snapshotCandidateWorkspace(root, writer, [
    '_build',
    'node_modules',
    '!app/_build/doc/**',
  ]);
  expect(written).toEqual([
    'candidate/app/_build/doc/geometry/index.html',
    'candidate/app/main.ml',
  ]);
  expect(artifacts.map((entry) => entry.path)).toEqual([
    'candidate/app',
    'candidate/app/_build',
    'candidate/app/_build/doc',
    'candidate/app/_build/doc/geometry',
    'candidate/app/_build/doc/geometry/index.html',
    'candidate/app/main.ml',
  ]);
});

test("a scenario's workspace.ignore comes after the project's and is recorded in the manifest", async () => {
  const root = await directory();
  const evaluation = defineEval({
    id: 'docs',
    agent: defineAgent({
      async start({ context }) {
        return {
          send: async () => {
            const docs = join(context.workspace.root, '_build/doc');
            await mkdir(docs, { recursive: true });
            await writeFile(join(docs, 'index.html'), 'docs');
            await writeFile(
              join(context.workspace.root, '_build/main.exe'),
              'bin',
            );
            await writeFile(join(context.workspace.root, 'notes.tmp'), 'tmp');
            return 'ok';
          },
        };
      },
    }),
    transcript: [user('go')],
    scoring: [predicate('verdict', () => true)],
    workspace: { ignore: ['!_build/doc/**', '*.tmp'] },
  });
  const result = await runOne(
    runEval(evaluation, {
      report: localReportStore(join(root, 'results')),
      workspaceRoot: join(root, 'sandbox'),
      artifactExclude: ['_build'],
    }),
  );
  const runDir = join(root, 'results', result.runId);
  const manifest = JSON.parse(
    await Bun.file(join(runDir, 'manifest.json')).text(),
  );
  expect(manifest.workspaceIgnore).toEqual([
    '_build',
    '!_build/doc/**',
    '*.tmp',
  ]);
  expect(
    await readdir(join(runDir, 'artifacts/candidate'), { recursive: true }),
  ).toEqual(
    expect.arrayContaining(['_build', '_build/doc', '_build/doc/index.html']),
  );
  const saved = await readdir(join(runDir, 'artifacts/candidate'), {
    recursive: true,
  });
  expect(saved).not.toContain('_build/main.exe');
  expect(saved).not.toContain('notes.tmp');
});

test('workspace.ignore patterns must be non-empty globs', () => {
  expect(() =>
    defineEval({
      id: 'bad',
      agent: defineAgent({
        async start() {
          return { send: async () => 'ok' };
        },
      }),
      transcript: [user('go')],
      scoring: [],
      workspace: { ignore: ['!'] },
    }),
  ).toThrow('workspace.ignore[0] must be a non-empty glob');
});

test('persistent workspaces are kept only for runs that did not pass, by default', async () => {
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
    runOne(
      runEval(scenario(passes), {
        report: localReportStore(join(root, 'results')),
        workspaceRoot: sandbox,
        ...(keepWorkspaces ? { keepWorkspaces } : {}),
      }),
    );
  const failed = await run(false);
  await run(true);
  expect(await readdir(sandbox)).toEqual([failed.runId]);
  const kept = await run(true, 'all');
  expect((await readdir(sandbox)).sort()).toEqual(
    [failed.runId, kept.runId].sort(),
  );
  await run(false, 'none');
  expect((await readdir(sandbox)).length).toBe(2);
});
