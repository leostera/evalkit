/** Set by the share server on each page (`data-evalkit-share`); absent elsewhere. */
export type ShareContext = {
  /** All repositories: `/api/v1/repos`. */
  repos: string;
  /** This repository's commits, for the version picker. */
  commits?: string;
  /** This commit's snapshot data. Absent on the repository list. */
  data?: string;
  repo?: string;
  /** Where this repository's pages live: `/<repo>`, or the server's base path in single-repository mode. */
  pages?: string;
  /** The server's front page, e.g. `/` or `/evals/`. */
  home: string;
  /** Single-repository mode: there is no list of repositories. */
  single: boolean;
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
  const optional = (key: 'commits' | 'data' | 'repo' | 'pages' | 'missing') =>
    typeof value[key] === 'string' ? { [key]: value[key] } : {};
  return {
    repos: value.repos,
    home: typeof value.home === 'string' ? value.home : '/',
    single: value.single === true,
    ...optional('commits'),
    ...optional('data'),
    ...optional('repo'),
    ...optional('pages'),
    ...optional('missing'),
  };
}

/**
 * Where the version picker goes for another commit: the same page, except
 * run pages (their IDs belong to one commit) fall back to the runs list.
 */
export function versionHref(
  pages: string,
  commit: string,
  pathname: string,
  search: string,
): string {
  const commitScoped = /^\/(runs|workspaces)\/./.test(pathname);
  const path = commitScoped ? '/runs' : pathname === '/' ? '/' : pathname;
  return `${pages}/-/${commit}${path}${commitScoped ? '' : search}`;
}
