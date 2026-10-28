import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import type { EvalRegistry, RunCatalog, RunSource } from '@evalkit/core';

const exec = promisify(execFile);
type Env = Record<string, string | undefined>;

/**
 * Normalize a git remote to a stable repository key: lowercase host, no
 * credentials, port, scheme, `.git`, or trailing slash.
 *
 *   git@GitLab.example.com:group/sub/repo.git → gitlab.example.com/group/sub/repo
 *   https://user:token@github.com/o/r/        → github.com/o/r
 *   /srv/repos/thing.git (no host)            → local/thing
 */
export function normalizeRepoUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(trimmed);
  if (scp && !/^[a-z]+:\/\//i.test(trimmed))
    return `${scp[1]!.toLowerCase()}/${scp[2]!.replace(/^\/+/, '')}`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'file:' && parsed.hostname)
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    // Not a URL: a local path.
  }
  return `local/${basename(trimmed)}`;
}

async function git(
  cwd: string,
  ...args: string[]
): Promise<string | undefined> {
  try {
    const { stdout } = await exec('git', ['-C', cwd, ...args], {
      timeout: 10_000,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

const posix = (path: string) => path.split(sep).join('/');
const projectPath = (root: string | undefined, projectRoot: string) =>
  root ? posix(relative(root, projectRoot)) : '';

function ciSource(
  env: Env,
  projectRoot: string,
): Omit<RunSource, 'dirty'> | undefined {
  if (env.EVALKIT_SOURCE_REPO && env.EVALKIT_SOURCE_COMMIT)
    return {
      repo: normalizeRepoUrl(env.EVALKIT_SOURCE_REPO),
      project: env.EVALKIT_SOURCE_PROJECT ?? '',
      commit: env.EVALKIT_SOURCE_COMMIT,
      ...(env.EVALKIT_SOURCE_REF ? { ref: env.EVALKIT_SOURCE_REF } : {}),
      ...(env.EVALKIT_SOURCE_COMMITTED_AT
        ? { committedAt: env.EVALKIT_SOURCE_COMMITTED_AT }
        : {}),
    };
  if (env.GITLAB_CI === 'true' && env.CI_PROJECT_URL && env.CI_COMMIT_SHA)
    return {
      repo: normalizeRepoUrl(env.CI_PROJECT_URL),
      project: projectPath(env.CI_PROJECT_DIR, projectRoot),
      commit: env.CI_COMMIT_SHA,
      ...((env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ?? env.CI_COMMIT_REF_NAME)
        ? {
            ref:
              env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ?? env.CI_COMMIT_REF_NAME,
          }
        : {}),
      ...(env.CI_COMMIT_TIMESTAMP
        ? { committedAt: env.CI_COMMIT_TIMESTAMP }
        : {}),
      ci: {
        provider: 'gitlab',
        ...(env.CI_PIPELINE_ID ? { pipeline: env.CI_PIPELINE_ID } : {}),
        ...(env.CI_JOB_ID ? { job: env.CI_JOB_ID } : {}),
        ...(env.CI_JOB_URL ? { url: env.CI_JOB_URL } : {}),
      },
    };
  if (
    env.GITHUB_ACTIONS === 'true' &&
    env.GITHUB_REPOSITORY &&
    env.GITHUB_SHA
  ) {
    const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
    return {
      repo: normalizeRepoUrl(`${server}/${env.GITHUB_REPOSITORY}`),
      project: projectPath(env.GITHUB_WORKSPACE, projectRoot),
      commit: env.GITHUB_SHA,
      ...(env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME
        ? { ref: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME }
        : {}),
      ci: {
        provider: 'github',
        ...(env.GITHUB_RUN_ID ? { pipeline: env.GITHUB_RUN_ID } : {}),
        ...(env.GITHUB_JOB ? { job: env.GITHUB_JOB } : {}),
        ...(env.GITHUB_RUN_ID
          ? {
              url: `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
            }
          : {}),
      },
    };
  }
  return undefined;
}

/**
 * Determine which repository and commit this project's eval code comes from.
 * Order: EVALKIT_SOURCE_* variables, GitLab/GitHub CI variables, then git.
 * Returns undefined outside git with no CI variables ("untracked" results).
 *
 * `outputDirs` (results, sandbox, snapshot) never make the tree dirty, even
 * when a project forgot to ignore them.
 */
export async function detectSource(
  givenRoot: string,
  options: { env?: Env; outputDirs?: readonly string[] } = {},
): Promise<RunSource | undefined> {
  const env = options.env ?? process.env;
  // git reports resolved paths (macOS: /var → /private/var); compare like with like.
  const projectRoot = await realpath(givenRoot).catch(() => givenRoot);
  const top = await git(projectRoot, 'rev-parse', '--show-toplevel');
  const excludes = top
    ? (options.outputDirs ?? [])
        .map((dir) => join(projectRoot, relative(givenRoot, dir)))
        .map((dir) => posix(relative(top, dir)))
        .filter((dir) => dir && !dir.startsWith('..'))
        .map((dir) => `:(exclude)${dir}`)
    : [];
  const dirty = top
    ? Boolean(await git(top, 'status', '--porcelain', '--', '.', ...excludes))
    : false;
  const fromCi = ciSource(env, projectRoot);
  if (fromCi)
    return {
      ...fromCi,
      ...(top && !env.EVALKIT_SOURCE_PROJECT
        ? { project: projectPath(top, projectRoot) }
        : {}),
      dirty,
    };
  if (!top) return undefined;
  const commit = await git(top, 'rev-parse', 'HEAD');
  if (!commit) return undefined; // A repository with no commits yet.
  const remote =
    (await git(top, 'config', '--get', 'remote.origin.url')) ??
    (await git(top, 'remote'))
      ?.split('\n')
      .map((name) => name.trim())
      .find(Boolean);
  const remoteUrl =
    remote && !remote.includes('/') && !remote.includes(':')
      ? await git(top, 'config', '--get', `remote.${remote}.url`)
      : remote;
  const ref = await git(top, 'symbolic-ref', '--short', '-q', 'HEAD');
  const committedAt = await git(top, 'show', '-s', '--format=%cI', 'HEAD');
  return {
    repo: normalizeRepoUrl(remoteUrl ?? top),
    project: projectPath(top, projectRoot),
    commit,
    ...(ref ? { ref } : {}),
    ...(committedAt ? { committedAt } : {}),
    dirty,
  };
}

/** The project's evals and suites, saved with each run (`catalog.json`). */
export function runCatalog(registry: EvalRegistry): RunCatalog {
  return {
    catalog: registry.catalog(),
    evals: registry.metadata(),
    suites: registry.suiteMetadata(),
  };
}

/** `abc1234` or `abc1234+dirty`. */
export function shortSource(source: RunSource): string {
  return `${source.commit.slice(0, 7)}${source.dirty ? '+dirty' : ''}`;
}
