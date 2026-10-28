/**
 * The share server's metadata index: repositories, commits and runs.
 * R2 (or a directory) holds the files; this index answers "what exists" and
 * every listing query. It is derived from stored run.json files and can be
 * rebuilt from them (`POST /api/v1/reindex`).
 */

/** Synchronous SQLite access, provided by Durable Object storage or bun:sqlite. */
export type Sql = {
  all<T>(query: string, ...params: SqlValue[]): T[];
  run(query: string, ...params: SqlValue[]): void;
  transaction<T>(work: () => T): T;
};
export type SqlValue = string | number | null;

export type RunRecord = {
  repo: string; // repository key, including `/~project`
  repoUrl: string; // normalized repository, without the project
  project: string;
  sha: string;
  ref?: string;
  committedAt?: string;
  runId: string;
  evalId: string;
  suiteId?: string;
  status: string;
  score?: number;
  startedAt: string;
  dirty: boolean;
  /** The dashboard RunSummary served in runs.json. */
  summary: unknown;
};

export type RepoRow = {
  key: string;
  url: string;
  project: string;
  firstSeenAt: string;
  lastUploadAt: string;
  commits: number;
};

export type CommitRow = {
  commit: string;
  ref?: string;
  committedAt?: string;
  firstSeenAt: string;
  runs: number;
  passed: number;
  failed: number;
};

/** The operations the app needs; async so a Durable Object can sit behind it. */
export type ShareIndex = {
  hasRun(runId: string): Promise<boolean>;
  recordRun(record: RunRecord): Promise<void>;
  repos(): Promise<RepoRow[]>;
  commits(repo: string): Promise<CommitRow[]>;
  runs(repo: string, sha: string): Promise<unknown[]>;
  /** Full SHA for a full SHA, a unique prefix (≥ 7), or a ref's latest commit. */
  resolve(repo: string, ref: string): Promise<string | undefined>;
  latest(repo: string): Promise<string | undefined>;
};

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS repos (
    key TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    project TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_upload_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS commits (
    repo TEXT NOT NULL,
    sha TEXT NOT NULL,
    ref TEXT,
    committed_at TEXT,
    first_seen_at TEXT NOT NULL,
    runs INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (repo, sha)
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    repo TEXT NOT NULL,
    sha TEXT NOT NULL,
    eval_id TEXT NOT NULL,
    suite_id TEXT,
    status TEXT NOT NULL,
    score REAL,
    started_at TEXT NOT NULL,
    dirty INTEGER NOT NULL,
    summary_json TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS commits_by_time ON commits (repo, committed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS commits_by_ref ON commits (repo, ref, committed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS runs_by_commit ON runs (repo, sha)`,
  `CREATE INDEX IF NOT EXISTS runs_by_eval ON runs (repo, eval_id, started_at)`,
];

/** Newest first; commits without a commit time order by first upload. */
const BY_TIME = `ORDER BY COALESCE(committed_at, first_seen_at) DESC, first_seen_at DESC`;

export class ShareIndexDb {
  constructor(
    private readonly sql: Sql,
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const statement of MIGRATIONS) sql.run(statement);
  }

  hasRun(runId: string): boolean {
    return this.sql.all('SELECT 1 FROM runs WHERE id = ?', runId).length > 0;
  }

  /** Idempotent: recording an indexed run again changes nothing. */
  recordRun(record: RunRecord): void {
    const at = this.now().toISOString();
    this.sql.transaction(() => {
      if (this.hasRun(record.runId)) return;
      this.sql.run(
        `INSERT INTO repos (key, url, project, first_seen_at, last_upload_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET last_upload_at = excluded.last_upload_at`,
        record.repo,
        record.repoUrl,
        record.project,
        at,
        at,
      );
      this.sql.run(
        `INSERT INTO commits (repo, sha, ref, committed_at, first_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (repo, sha) DO UPDATE SET
           ref = COALESCE(commits.ref, excluded.ref),
           committed_at = COALESCE(commits.committed_at, excluded.committed_at)`,
        record.repo,
        record.sha,
        record.ref ?? null,
        record.committedAt ?? null,
        at,
      );
      this.sql.run(
        `INSERT INTO runs (id, repo, sha, eval_id, suite_id, status, score,
                           started_at, dirty, summary_json, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        record.runId,
        record.repo,
        record.sha,
        record.evalId,
        record.suiteId ?? null,
        record.status,
        record.score ?? null,
        record.startedAt,
        record.dirty ? 1 : 0,
        JSON.stringify(record.summary),
        at,
      );
      // Dirty runs are shown but never count towards a commit's results.
      if (!record.dirty)
        this.sql.run(
          `UPDATE commits SET runs = runs + 1,
             passed = passed + ?, failed = failed + ?
           WHERE repo = ? AND sha = ?`,
          record.status === 'passed' ? 1 : 0,
          record.status === 'failed' || record.status === 'errored' ? 1 : 0,
          record.repo,
          record.sha,
        );
    });
  }

  repos(): RepoRow[] {
    return this.sql.all<RepoRow>(
      `SELECT key, url, project, first_seen_at AS firstSeenAt,
              last_upload_at AS lastUploadAt,
              (SELECT COUNT(*) FROM commits WHERE commits.repo = repos.key) AS commits
       FROM repos ORDER BY last_upload_at DESC`,
    );
  }

  commits(repo: string): CommitRow[] {
    return this.sql
      .all<CommitRow & { ref: string | null; committedAt: string | null }>(
        `SELECT sha AS "commit", ref, committed_at AS committedAt,
                first_seen_at AS firstSeenAt, runs, passed, failed
         FROM commits WHERE repo = ? ${BY_TIME}`,
        repo,
      )
      .map(({ ref, committedAt, ...row }) => ({
        ...row,
        ...(ref ? { ref } : {}),
        ...(committedAt ? { committedAt } : {}),
      }));
  }

  runs(repo: string, sha: string): unknown[] {
    return this.sql
      .all<{ summary_json: string }>(
        'SELECT summary_json FROM runs WHERE repo = ? AND sha = ? ORDER BY started_at DESC',
        repo,
        sha,
      )
      .map((row) => JSON.parse(row.summary_json) as unknown);
  }

  resolve(repo: string, ref: string): string | undefined {
    if (/^[0-9a-f]{7,40}$/.test(ref)) {
      const matches = this.sql.all<{ sha: string }>(
        'SELECT sha FROM commits WHERE repo = ? AND sha LIKE ? LIMIT 2',
        repo,
        `${ref}%`,
      );
      if (matches.length === 1) return matches[0]!.sha;
      if (matches.length > 1) return undefined; // ambiguous prefix
    }
    return this.sql.all<{ sha: string }>(
      `SELECT sha FROM commits WHERE repo = ? AND ref = ? ${BY_TIME} LIMIT 1`,
      repo,
      ref,
    )[0]?.sha;
  }

  latest(repo: string): string | undefined {
    return this.sql.all<{ sha: string }>(
      `SELECT sha FROM commits WHERE repo = ? ${BY_TIME} LIMIT 1`,
      repo,
    )[0]?.sha;
  }
}

/** Adapt the synchronous index (bun:sqlite) to the app's async interface. */
export function asyncIndex(db: ShareIndexDb): ShareIndex {
  return {
    hasRun: async (runId) => db.hasRun(runId),
    recordRun: async (record) => db.recordRun(record),
    repos: async () => db.repos(),
    commits: async (repo) => db.commits(repo),
    runs: async (repo, sha) => db.runs(repo, sha),
    resolve: async (repo, ref) => db.resolve(repo, ref),
    latest: async (repo) => db.latest(repo),
  };
}
