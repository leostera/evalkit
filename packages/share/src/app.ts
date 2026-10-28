import { Hono, type Context } from 'hono';
import { BundleError, decodeBundle } from './bundle.js';
import type { ShareFiles } from './files.js';
import { dashboardIndex } from './html.js';
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
  | { event: 'share.error'; method: string; path: string; error: string };

export type ShareAppOptions = {
  files: ShareFiles;
  index: ShareIndex;
  assets: DashboardAssets;
  /** Uncompressed bundle limit; the compressed body must also fit a Worker request. */
  maxBundleBytes?: number;
  /** Defaults to one JSON line per event on stdout (Workers Logs indexes these). */
  log?: (event: ShareEvent) => void;
};

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
 *   GET  /api/v1/repos                           indexed repositories
 *   GET  /api/v1/repos/<repo>/-/commits          commits, newest first
 *   GET  /api/v1/repos/<repo>/-/<sha>/data/…     snapshot data
 *   GET  /assets/*                               dashboard JS/CSS
 *   GET  /<repo>                                 → latest commit
 *   GET  /<repo>/-/<ref|prefix>/…                → full SHA
 *   GET  everything else                         the dashboard app
 *
 * There is no authentication: run it on a private network.
 */
export function createShareApp(options: ShareAppOptions) {
  const { files, index, assets } = options;
  const log = options.log ?? jsonLine;
  const maxBundleBytes = options.maxBundleBytes ?? 256 * 1024 * 1024;
  const app = new Hono();

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
    let upload: RunUpload;
    try {
      const body = new Uint8Array(await context.req.arrayBuffer());
      upload = parseUpload(
        await decodeBundle(body, { maxBytes: maxBundleBytes }),
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
    const { run } = upload;
    const url = new URL(
      `/${run.repoKey}/-/${run.source.commit}/runs/${run.id}`,
      context.req.url,
    ).href;
    const exists = await index.hasRun(run.id);
    if (!exists) await storeRun(upload);
    const outcome = exists ? 'exists' : 'created';
    log({
      event: 'share.upload',
      outcome,
      repo: run.repoKey,
      commit: run.source.commit,
      runId: run.id,
      files: upload.files.length,
      bytes: upload.files.reduce((sum, file) => sum + file.data.byteLength, 0),
    });
    return context.json(
      { status: outcome, url },
      outcome === 'created' ? 201 : 200,
    );
  });

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
    context.json({ repos: await index.repos() }, 200, NO_CACHE),
  );

  // /api/v1/repos/<repo>/-/commits and /api/v1/repos/<repo>/-/<sha>/data/…
  app.get('/api/v1/repos/*', async (context) => {
    const path = context.req.path.slice('/api/v1/repos/'.length);
    const marker = path.indexOf('/-/');
    const key = marker === -1 ? '' : path.slice(0, marker);
    if (!validRepoKey(key))
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
    const path = context.req.path.slice('/assets/'.length);
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
    const path = url.pathname.replace(/\/+$/, '');
    const marker = path.indexOf('/-/');
    if (marker === -1) return repositoryPage(context, path.slice(1));
    const repo = path.slice(1, marker);
    const [ref = '', ...rest] = url.pathname.slice(marker + 3).split('/');
    const sha = validRepoKey(repo)
      ? await index.resolve(repo, decodeURIComponent(ref))
      : undefined;
    if (!sha) return dashboardPage(context, { kind: 'missing', repo, ref });
    if (sha !== ref)
      return context.redirect(
        `/${repo}/-/${sha}/${rest.join('/')}${url.search}`,
      );
    return dashboardPage(context, { kind: 'commit', repo, sha });
  });

  /** `/` lists repositories; `/<repo>` opens its latest commit. */
  async function repositoryPage(context: Context, repo: string) {
    if (!repo) return dashboardPage(context, { kind: 'repositories' });
    const latest = validRepoKey(repo) ? await index.latest(repo) : undefined;
    if (latest) return context.redirect(`/${repo}/-/${latest}/`);
    return dashboardPage(context, { kind: 'missing', repo });
  }

  /** The dashboard's index.html, told where this page's data lives. */
  async function dashboardPage(context: Context, page: SharePage) {
    const api =
      page.kind === 'repositories'
        ? undefined
        : `/api/v1/repos/${page.repo}/-/`;
    return context.html(
      dashboardIndex(await assets.index(), {
        base: page.kind === 'commit' ? `/${page.repo}/-/${page.sha}/` : '/',
        assets: '/assets/',
        share: {
          repos: '/api/v1/repos',
          ...(page.kind === 'repositories'
            ? {}
            : { repo: page.repo, commits: `${api}commits` }),
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
    const runFile = /^runs\/([^/]+)\/(trials\.json|trials\/.+)$/.exec(path);
    if (!runFile || !isUuid(runFile[1]!)) return context.notFound();
    const body = await files.get(`${commitBase}/${path}`);
    if (!body) return context.notFound();
    const json = path.endsWith('.json') && !path.includes('/workspace/');
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
