import { Hono, type Context } from 'hono';
import { BundleError, decodeBundle } from './bundle.js';
import type { ShareFiles } from './files.js';
import { dashboardIndex } from './html.js';
import {
  isLegacyRun,
  upgradeCatalogFile,
  upgradeSnapshotRun,
} from './legacy.js';
import type { ShareIndex } from './index-db.js';
import { isSha, isUuid, safeSegment, validRepoKey } from './paths.js';
import {
  parseCatalog,
  parseRun,
  parseUpload,
  Rejected,
  type RunCatalog,
  type RunUpload,
  type SharedRun,
} from './upload.js';

/** The bundled dashboard: its index.html template and its JS/CSS files. */
export type DashboardAssets = {
  index(): Promise<string>;
  get(path: string): Promise<Response | null>;
};

/** One structured log event. Bounded fields only; never file contents. */
export type ShareEvent =
  | {
      event: 'share.upload';
      outcome: 'created' | 'exists';
      repo: string;
      commit: string;
      runId: string;
      files: number;
      bytes: number;
    }
  | { event: 'share.upload'; outcome: 'rejected'; reason: string }
  | { event: 'share.reindex'; runs: number; indexed: number }
  | {
      event: 'share.upgrade';
      upgraded: number;
      runs: number;
      remaining: number;
    }
  | { event: 'share.error'; method: string; path: string; error: string };

export type ShareAppOptions = {
  files: ShareFiles;
  index: ShareIndex;
  assets: DashboardAssets;
  /** Uncompressed bundle limit; the compressed body must also fit a Worker request. */
  maxBundleBytes?: number;
  /** Defaults to one JSON line per event on stdout (Workers Logs indexes these). */
  log?: (event: ShareEvent) => void;
  /**
   * Serve everything below this path, e.g. `/evals` on a site's own domain.
   * Every URL the server makes carries it; other paths are not answered.
   */
  basePath?: string;
  /**
   * Single-repository mode: show and accept only this repository key (as
   * `evalkit share` derives it, e.g. `github.com/acme/agents`). Pages drop
   * the repository from their URLs (`/-/<sha>/runs`), there is no list of
   * repositories, and uploads for any other repository are rejected.
   */
  repo?: string;
};

/** `''` or `/a/b`: a path prefix with no trailing slash. */
export function normalizeBasePath(basePath: string | undefined): string {
  const path = (basePath ?? '').replace(/\/+$/, '');
  if (path && !/^(\/[A-Za-z0-9._~-]+)+$/.test(path))
    throw new Error(
      `basePath must look like /evals (letters, digits, ".", "_", "~" and "-" between slashes), got ${JSON.stringify(basePath)}`,
    );
  return path;
}

/** What a non-API path shows. */
type SharePage =
  | { kind: 'repositories' }
  | { kind: 'missing'; repo: string; ref?: string }
  | { kind: 'commit'; repo: string; sha: string };

const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_CACHE = { 'cache-control': 'no-cache' };
const RUN_FILE =
  /^repos\/(.+)\/commits\/([0-9a-f]{40})\/runs\/([^/]+)\/run\.json$/;
const EMPTY_CATALOG: RunCatalog = { catalog: [], evals: [], suites: [] };

const jsonLine = (event: ShareEvent) => console.log(JSON.stringify(event));

/**
 * The share server: a small JSON API plus the dashboard app. It stores
 * uploaded run bundles and shows one read-only snapshot per repository commit.
 *
 *   POST /api/v1/uploads                         one run bundle
 *   POST /api/v1/reindex                         rebuild the index from stored run.json files
 *   POST /api/v1/upgrade                         convert stored runs from before 0.9 (RFD0008)
 *   GET  /api/v1/repos                           indexed repositories
 *   GET  /api/v1/repos/<repo>/-/commits          commits, newest first
 *   GET  /api/v1/repos/<repo>/-/<sha>/data/…     snapshot data
 *   GET  /assets/*                               dashboard JS/CSS
 *   GET  /<repo>                                 → latest commit
 *   GET  /<repo>/-/<ref|prefix>/…                → full SHA
 *   GET  everything else                         the dashboard app
 *
 * All of it below `basePath` when set. With `repo` (single-repository mode)
 * pages are `/` (→ latest commit) and `/-/<ref|prefix>/…`.
 *
 * There is no authentication: run it on a private network.
 */
export function createShareApp(options: ShareAppOptions) {
  const { files, index, assets } = options;
  const log = options.log ?? jsonLine;
  const maxBundleBytes = options.maxBundleBytes ?? 256 * 1024 * 1024;
  const base = normalizeBasePath(options.basePath);
  const single = options.repo;
  if (single !== undefined && !validRepoKey(single))
    throw new Error(
      `repo must be a repository key such as github.com/acme/agents, got ${JSON.stringify(single)}`,
    );
  /** Where a repository's pages live: `<base>/<repo>`, or `<base>` for the single one. */
  const pagesOf = (repo: string) => (single ? base : `${base}/${repo}`);
  const shown = (repo: string) => !single || repo === single;
  /** The request path below `basePath`. */
  const local = (path: string) => path.slice(base.length);
  const app = base ? new Hono().basePath(base) : new Hono();

  app.onError((error, context) => {
    log({
      event: 'share.error',
      method: context.req.method,
      path: context.req.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return context.json({ error: 'Internal error' }, 500);
  });

  app.post('/api/v1/uploads', async (context) => {
    let uploads: RunUpload[];
    try {
      const body = new Uint8Array(await context.req.arrayBuffer());
      uploads = parseUpload(
        await decodeBundle(body, { maxBytes: maxBundleBytes }),
      );
      if (!uploads.length)
        throw new Rejected('The bundle has no finished runs');
      const other = uploads.find(({ run }) => !shown(run.repoKey));
      if (other)
        throw new Rejected(
          `This share server only accepts results for ${single}, not ${other.run.repoKey}`,
        );
    } catch (error) {
      if (!(error instanceof BundleError || error instanceof Rejected))
        throw error;
      log({
        event: 'share.upload',
        outcome: 'rejected',
        reason: error.message,
      });
      return context.json({ error: error.message }, 400);
    }
    // An upload from an older CLI can hold several runs (one per trial).
    let created = false;
    for (const upload of uploads) {
      const { run } = upload;
      const exists = await index.hasRun(run.id);
      if (!exists) await storeRun(upload);
      created ||= !exists;
      log({
        event: 'share.upload',
        outcome: exists ? 'exists' : 'created',
        repo: run.repoKey,
        commit: run.source.commit,
        runId: run.id,
        files: upload.files.length,
        bytes: upload.files.reduce(
          (sum, file) => sum + file.data.byteLength,
          0,
        ),
      });
    }
    const { run } = uploads[0]!;
    const url = new URL(
      `${pagesOf(run.repoKey)}/-/${run.source.commit}/runs/${run.id}`,
      context.req.url,
    ).href;
    return context.json(
      { status: created ? 'created' : 'exists', url },
      created ? 201 : 200,
    );
  });

  /**
   * Converts stored runs from before 0.9 (snapshot format version 1, a run of
   * trials) into one run per trial, `limit` old runs per request (default
   * 20), so it fits a Worker's limits. Call it until `remaining` is 0. New
   * objects and index rows are written before old ones are removed, so an
   * interrupted upgrade is finished by calling it again.
   */
  app.post('/api/v1/upgrade', async (context) => {
    const limit = Math.min(
      Math.max(Number(context.req.query('limit') ?? 20) || 20, 1),
      200,
    );
    const legacy: string[] = [];
    for await (const key of files.list('repos/')) {
      if (!RUN_FILE.test(key)) continue;
      const data = await readBytes(await files.get(key));
      if (!data) continue;
      let value: unknown;
      try {
        value = JSON.parse(new TextDecoder().decode(data));
      } catch {
        continue;
      }
      if (isLegacyRun(value)) legacy.push(key);
    }
    let runs = 0;
    const batch = legacy.slice(0, limit);
    for (const key of batch) runs += await upgradeStoredRun(key);
    const result = {
      upgraded: batch.length,
      runs,
      remaining: legacy.length - batch.length,
    };
    log({ event: 'share.upgrade', ...result });
    return context.json(result);
  });

  /** One stored version 1 run → version 2 runs; returns how many. */
  async function upgradeStoredRun(runJsonKey: string): Promise<number> {
    const [, repo, sha, oldRunId] = RUN_FILE.exec(runJsonKey)!;
    const commitBase = `repos/${repo}/commits/${sha}`;
    const runBase = `${commitBase}/runs/${oldRunId}`;
    const stored = new Map<string, Uint8Array>();
    const keys: string[] = [];
    for await (const key of files.list(`${runBase}/`)) keys.push(key);
    for (const key of keys) {
      const data = await readBytes(await files.get(key));
      if (data) stored.set(key.slice(runBase.length + 1), data);
    }
    let count = 0;
    const written = new Set<string>();
    let newRunJson: Uint8Array | undefined;
    for (const upgraded of upgradeSnapshotRun(stored)) {
      const runJson = upgraded.files.get('run.json')!;
      const run = storedRun(runJson);
      if (!run) continue; // cancelled or unfinished: not a shareable run
      count += 1;
      // A run of one trial keeps its ID: its new files replace the old ones.
      const inPlace = run.id === oldRunId;
      if (!inPlace && (await index.hasRun(run.id))) continue; // done before a crash
      const base = `${commitBase}/runs/${run.id}`;
      for (const [path, data] of upgraded.files) {
        if (path === 'run.json') continue;
        await files.put(`${base}/${path}`, data);
        written.add(`${base}/${path}`);
      }
      if (inPlace) {
        await index.forgetRun(run.id); // the old row, replaced below
        newRunJson = runJson;
      } else await files.put(`${base}/run.json`, runJson);
      await index.recordRun(run);
    }
    const catalog = await readBytes(
      await files.get(`${commitBase}/catalog.json`),
    );
    if (catalog)
      await files.put(
        `${commitBase}/catalog.json`,
        upgradeCatalogFile(catalog),
      );
    if (!newRunJson) await index.forgetRun(oldRunId!);
    for (const key of keys)
      if (key !== runJsonKey && !written.has(key)) await files.delete(key);
    // run.json last: until it changes, the next call retries this run.
    if (newRunJson) await files.put(runJsonKey, newRunJson);
    else await files.delete(runJsonKey);
    return count;
  }

  /** Files first, index last: a run becomes visible only once it is indexed. */
  async function storeRun({
    run,
    runJson,
    catalog,
    files: runFiles,
  }: RunUpload) {
    const commitBase = `repos/${run.repoKey}/commits/${run.source.commit}`;
    const runBase = `${commitBase}/runs/${run.id}`;
    for (const file of runFiles)
      await files.put(`${runBase}/${file.path}`, file.data);
    // A committed run's catalog describes the commit; a dirty run's only fills a gap.
    if (
      catalog &&
      (!run.source.dirty || !(await files.get(`${commitBase}/catalog.json`)))
    )
      await files.put(`${commitBase}/catalog.json`, catalog);
    await files.put(`${runBase}/run.json`, runJson);
    await index.recordRun(run);
  }

  app.post('/api/v1/reindex', async (context) => {
    let runs = 0;
    let indexed = 0;
    for await (const key of files.list('repos/')) {
      if (!RUN_FILE.test(key)) continue;
      runs += 1;
      const run = storedRun(await readBytes(await files.get(key)));
      if (!run || (await index.hasRun(run.id))) continue;
      await index.recordRun(run);
      indexed += 1;
    }
    log({ event: 'share.reindex', runs, indexed });
    return context.json({ runs, indexed });
  });

  app.get('/api/v1/repos', async (context) =>
    context.json(
      { repos: (await index.repos()).filter((repo) => shown(repo.key)) },
      200,
      NO_CACHE,
    ),
  );

  // /api/v1/repos/<repo>/-/commits and /api/v1/repos/<repo>/-/<sha>/data/…
  app.get('/api/v1/repos/*', async (context) => {
    const path = local(context.req.path).slice('/api/v1/repos/'.length);
    const marker = path.indexOf('/-/');
    const key = marker === -1 ? '' : path.slice(0, marker);
    if (!validRepoKey(key) || !shown(key))
      return context.json({ error: 'Unknown repository' }, 404);
    const [sha = '', kind, ...segments] = path.slice(marker + 3).split('/');
    if (sha === 'commits' && kind === undefined)
      return context.json(
        { repo: key, commits: await index.commits(key) },
        200,
        NO_CACHE,
      );
    if (!isSha(sha) || kind !== 'data')
      return context.json({ error: 'Not found' }, 404);
    return serveData(context, key, sha, segments.map(decodeURIComponent));
  });

  // The bundled dashboard's JS/CSS. A Worker serves these as static assets
  // before this app runs; the Bun server serves them here.
  app.get('/assets/*', async (context) => {
    const path = local(context.req.path).slice('/assets/'.length);
    if (!path.split('/').every(safeSegment)) return context.notFound();
    const response = await assets.get(path);
    if (!response) return context.notFound();
    const headers = new Headers(response.headers);
    headers.set('cache-control', IMMUTABLE);
    return new Response(response.body, { status: response.status, headers });
  });

  app.all('/api/*', (context) => context.json({ error: 'Not found' }, 404));

  // Every other path is the dashboard app. Short refs resolve to full SHAs
  // first, so every commit page URL names one immutable commit.
  app.get('*', async (context) => {
    const url = new URL(context.req.url);
    const pathname = local(url.pathname);
    const path = pathname.replace(/\/+$/, '');
    if (single) {
      // A link from before single-repository mode: drop the repository.
      if (path === `/${single}` || path.startsWith(`/${single}/`))
        return context.redirect(
          `${base}${path.slice(single.length + 1) || '/'}${url.search}`,
        );
      if (!path) return latestPage(context, single);
      if (!path.startsWith('/-/'))
        return dashboardPage(context, { kind: 'missing', repo: single });
      return commitPage(context, single, pathname.slice(3), url.search);
    }
    const marker = path.indexOf('/-/');
    if (marker === -1) {
      const repo = path.slice(1);
      return repo
        ? latestPage(context, repo)
        : dashboardPage(context, { kind: 'repositories' });
    }
    return commitPage(
      context,
      path.slice(1, marker),
      pathname.slice(marker + 3),
      url.search,
    );
  });

  /**
   * `<pages>/-/<ref>/…`: a short ref resolves to its full SHA first, so every
   * commit page URL names one immutable commit.
   */
  async function commitPage(
    context: Context,
    repo: string,
    afterMarker: string,
    search: string,
  ) {
    const [ref = '', ...rest] = afterMarker.split('/');
    const sha = validRepoKey(repo)
      ? await index.resolve(repo, decodeURIComponent(ref))
      : undefined;
    if (!sha) return dashboardPage(context, { kind: 'missing', repo, ref });
    if (sha !== ref)
      return context.redirect(
        `${pagesOf(repo)}/-/${sha}/${rest.join('/')}${search}`,
      );
    return dashboardPage(context, { kind: 'commit', repo, sha });
  }

  /** A repository's own page opens its latest commit. */
  async function latestPage(context: Context, repo: string) {
    const latest = validRepoKey(repo) ? await index.latest(repo) : undefined;
    if (latest) return context.redirect(`${pagesOf(repo)}/-/${latest}/`);
    return dashboardPage(context, { kind: 'missing', repo });
  }

  /** The dashboard's index.html, told where this page's data lives. */
  async function dashboardPage(context: Context, page: SharePage) {
    const api =
      page.kind === 'repositories'
        ? undefined
        : `${base}/api/v1/repos/${page.repo}/-/`;
    return context.html(
      dashboardIndex(await assets.index(), {
        base:
          page.kind === 'commit'
            ? `${pagesOf(page.repo)}/-/${page.sha}/`
            : `${base}/`,
        assets: `${base}/assets/`,
        share: {
          repos: `${base}/api/v1/repos`,
          home: `${base}/`,
          ...(single ? { single: true } : {}),
          ...(page.kind === 'repositories'
            ? {}
            : {
                repo: page.repo,
                pages: pagesOf(page.repo),
                commits: `${api}commits`,
              }),
          ...(page.kind === 'commit' ? { data: `${api}${page.sha}/` } : {}),
          ...(page.kind === 'missing' && page.ref ? { missing: page.ref } : {}),
        },
      }),
      page.kind === 'missing' ? 404 : 200,
      NO_CACHE,
    );
  }

  async function serveData(
    context: Context,
    key: string,
    sha: string,
    segments: string[],
  ) {
    if (!segments.every(safeSegment)) return context.notFound();
    const path = segments.join('/');
    const commitBase = `repos/${key}/commits/${sha}`;
    if (path === 'runs.json')
      return context.json({ runs: await index.runs(key, sha) }, 200, NO_CACHE); // grows as runs are uploaded
    if (['catalog.json', 'evals.json', 'suites.json'].includes(path)) {
      // Parsed at upload, so a stored catalog is always well formed.
      const data = await readBytes(
        await files.get(`${commitBase}/catalog.json`),
      );
      const catalog = data ? parseCatalog(data) : EMPTY_CATALOG;
      return context.json(
        path === 'catalog.json'
          ? { evals: catalog.catalog }
          : path === 'evals.json'
            ? { evals: catalog.evals }
            : { suites: catalog.suites },
        200,
        NO_CACHE,
      );
    }
    const runFile =
      /^runs\/([^/]+)\/((?:detail|events|artifacts|workspace)\.json|(?:workspace|attachments)\/.+)$/.exec(
        path,
      );
    if (!runFile || !isUuid(runFile[1]!)) return context.notFound();
    const body = await files.get(`${commitBase}/${path}`);
    if (!body) return context.notFound();
    // Workspace files and attachments are untrusted, whatever their name.
    const json =
      path.endsWith('.json') &&
      !path.includes('/workspace/') &&
      !path.includes('/attachments/');
    return new Response(body as BodyInit, {
      headers: json
        ? { 'content-type': 'application/json', 'cache-control': IMMUTABLE }
        : {
            // Candidate files are untrusted content on this origin: never render them.
            'content-type': 'application/octet-stream',
            'x-content-type-options': 'nosniff',
            'content-security-policy': 'sandbox',
            'cache-control': IMMUTABLE,
          },
    });
  }

  return app;
}

/** A stored run.json, or undefined if it is not a shareable run. */
function storedRun(data: Uint8Array | null): SharedRun | undefined {
  if (!data) return undefined;
  try {
    return parseRun(data);
  } catch (error) {
    if (error instanceof Rejected) return undefined;
    throw error;
  }
}

async function readBytes(
  body: ReadableStream<Uint8Array> | Uint8Array | null,
): Promise<Uint8Array | null> {
  if (!body) return null;
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(await new Response(body).arrayBuffer());
}
