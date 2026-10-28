/** Set by the share server on each page (`data-evalkit-share`); absent elsewhere. */
export type ShareContext = {
  /** All repositories: `/api/v1/repos`. */
  repos: string;
  /** This repository's commits, for the version picker. */
  commits?: string;
  /** This commit's snapshot data. Absent on the repository list. */
  data?: string;
  repo?: string;
  /** A ref or SHA with no shared results. */
  missing?: string;
};

export type ShareRepo = {
  key: string;
  commits: number;
  lastUploadAt: string;
};

export type ShareCommit = {
  commit: string;
  ref?: string;
  committedAt?: string;
  firstSeenAt: string;
  runs: number;
  passed: number;
  failed: number;
};

/** The page's share context, or undefined outside the share server. */
export function readShareContext(
  element: HTMLElement = document.documentElement,
): ShareContext | undefined {
  const raw = element.dataset.evalkitShare;
  if (!raw) return undefined;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (typeof value?.repos !== 'string') return undefined;
  const optional = (key: 'commits' | 'data' | 'repo' | 'missing') =>
    typeof value[key] === 'string' ? { [key]: value[key] } : {};
  return {
    repos: value.repos,
    ...optional('commits'),
    ...optional('data'),
    ...optional('repo'),
    ...optional('missing'),
  };
}

/**
 * Where the version picker goes for another commit: the same page, except
 * run/trial pages (their IDs belong to one commit) fall back to the runs list.
 */
export function versionHref(
  repo: string,
  commit: string,
  pathname: string,
  search: string,
): string {
  const commitScoped = /^\/(runs|trials|workspaces)\/./.test(pathname);
  const path = commitScoped ? '/runs' : pathname === '/' ? '/' : pathname;
  return `/${repo}/-/${commit}${path}${commitScoped ? '' : search}`;
}
