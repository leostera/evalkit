import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectSource, normalizeRepoUrl } from './source.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const noCi = {}; // isolate tests from the CI running them

test('repository URLs normalize to a stable key', () => {
  for (const url of [
    'git@GitLab.example.com:group/sub/repo.git',
    'https://user:token@gitlab.example.com/group/sub/repo.git/',
    'ssh://git@gitlab.example.com:2222/group/sub/repo',
    'https://gitlab.example.com/group/sub/repo',
  ])
    expect(normalizeRepoUrl(url)).toBe('gitlab.example.com/group/sub/repo');
  expect(normalizeRepoUrl('/srv/repos/thing.git')).toBe('local/thing');
});

async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-source-'));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
      .toString()
      .trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('remote', 'add', 'origin', 'git@gitlab.example.com:team/evals.git');
  await mkdir(join(root, 'evals'));
  await writeFile(join(root, 'evals', 'a.eval.ts'), 'export {}\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return { root, git };
}

test('git provides repo, monorepo project path, commit, ref, time, and dirtiness', async () => {
  const { root, git } = await repo();
  const project = join(root, 'evals');
  const clean = await detectSource(project, {
    env: noCi,
    outputDirs: [join(project, '_evalkit-results')],
  });
  expect(clean).toMatchObject({
    repo: 'gitlab.example.com/team/evals',
    project: 'evals',
    commit: git('rev-parse', 'HEAD'),
    ref: 'main',
    dirty: false,
  });
  expect(clean?.committedAt).toMatch(/^\d{4}-\d\d-\d\dT/);

  // EvalKit's own output never counts as a change, even when not ignored.
  await mkdir(join(project, '_evalkit-results', 'run'), { recursive: true });
  await writeFile(join(project, '_evalkit-results', 'run', 'x.json'), '{}');
  expect(
    (
      await detectSource(project, {
        env: noCi,
        outputDirs: [join(project, '_evalkit-results')],
      })
    )?.dirty,
  ).toBe(false);

  await writeFile(join(project, 'a.eval.ts'), 'export const changed = 1;\n');
  expect((await detectSource(project, { env: noCi }))?.dirty).toBe(true);
});

test('CI variables take precedence over git, and no git means untracked', async () => {
  const { root } = await repo();
  const source = await detectSource(join(root, 'evals'), {
    env: {
      GITLAB_CI: 'true',
      CI_PROJECT_URL: 'https://gitlab.example.com/team/evals',
      CI_COMMIT_SHA: 'a'.repeat(40),
      CI_COMMIT_REF_NAME: 'feature',
      CI_PIPELINE_ID: '12',
      CI_JOB_ID: '34',
      CI_JOB_URL: 'https://gitlab.example.com/team/evals/-/jobs/34',
    },
  });
  expect(source).toMatchObject({
    repo: 'gitlab.example.com/team/evals',
    project: 'evals',
    commit: 'a'.repeat(40),
    ref: 'feature',
    dirty: false,
    ci: { provider: 'gitlab', pipeline: '12', job: '34' },
  });

  const outside = await mkdtemp(join(tmpdir(), 'evalkit-nogit-'));
  roots.push(outside);
  expect(await detectSource(outside, { env: noCi })).toBeUndefined();
});
