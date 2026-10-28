import { Hono, type Context } from 'hono';
import { BundleError, decodeBundle, type BundleFile } from './bundle.js';
import type { ShareFiles } from './files.js';
import { dashboardIndex } from './html.js';
import type { RunRecord, ShareIndex } from './index-db.js';
import {
  allowedRunPath,
  isSha,
  isUuid,
  repoKey,
  safeSegment,
  validRepoKey,
} from './paths.js';

/** The bundled dashboard: its index.html template and its JS/CSS files. */
export type DashboardAssets = {
  index(): Promise<string>;
  get(path: string): Promise<Response | null>;
};

export type ShareAppOptions = {
  files: ShareFiles;
  index: ShareIndex;
  assets: DashboardAssets;
  /** Uncompressed bundle limit; the compressed body must also fit a Worker request. */
  maxBundleBytes?: number;
};

type RunSummary = {
  id: string;
  evalId: string;
  suiteId?: string;
  status: string;
  score?: number;
  startedAt: string;
  source: {
    repo: string;
    project: string;
    commit: string;
    ref?: string;
    committedAt?: string;
    dirty: boolean;
  };
};

type RunCatalog = { catalog: unknown[]; evals: unknown[]; suites: unknown[] };

const IMMUTABLE = 'public, max-age=31536000, immutable';
const RUN_FILE =
  /^repos\/(.+)\/commits\/([0-9a-f]{40})\/runs\/([^/]+)\/run\.json$/;

class Rejected extends Error {}

/**
 * The share server: stores uploaded run bundles and serves them with the same
 * dashboard as `evalkit build`, one read-only snapshot per repository commit.
 *
 *   POST /api/v1/uploads                 one run bundle
 *   GET  /api/v1/repos                   indexed repositories
 *   POST /api/v1/reindex                 rebuild the index from stored run.json files
 *   GET  /<repo>                         → latest commit
 *   GET  /<repo>/-/commits.json          commits, newest first
 *   GET  /<repo>/-/<ref|prefix>/…        → full SHA
 *   GET  /<repo>/-/<sha>/data/…          snapshot data
 *   GET  /<repo>/-/<sha>/…               dashboard page
 *
 * There is no authentication: run it on a private network.
 */
export function createShareApp(options: ShareAppOptions) {
  const { files, index, assets } = options;
  const maxBundleBytes = options.maxBundleBytes ?? 256 * 1024 * 1024;
  const app = new Hono();

  app.post('/api/v1/uploads', async (context) => {
    let bundle: BundleFile[];
    try {
      bundle = await decodeBundle(
        new Uint8Array(await context.req.arrayBuffer()),
        { maxBytes: maxBundleBytes },
      );
      return await storeRun(context, bundle);
    } catch (error) {
      if (error instanceof BundleError || error instanceof Rejected)
        return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  async function storeRun(context: Context, bundle: BundleFile[]) {
    const paths = new Set<string>();
    for (const file of bundle) {
      if (!allowedRunPath(file.path))
        throw new Rejected(`File not allowed in a run bundle: ${file.path}`);
      if (paths.has(file.path))
        throw new Rejected(`Duplicate file in bundle: ${file.path}`);
      paths.add(file.path);
    }
    const runFile = bundle.find((file) => file.path === 'run.json');
    if (!runFile) throw new Rejected('Bundle has no run.json');
    const summary = parseSummary(runFile.data);
    const key = repoKey(summary.source);
    if (!validRepoKey(key))
      throw new Rejected(`Invalid repository key: ${key}`);
    const sha = summary.source.commit;
    const url = new URL(`/${key}/-/${sha}/runs/${summary.id}`, context.req.url)
      .href;
    if (await index.hasRun(summary.id))
      return context.json({ status: 'exists', url }, 200);

    // Files first, index last: a run is visible only once it is indexed.
    const commitBase = `repos/${key}/commits/${sha}`;
    for (const file of bundle)
      if (file.path !== 'run.json')
        await files.put(
          `${commitBase}/runs/${summary.id}/${file.path}`,
          file.data,
        );
    const catalog = bundle.find((file) => file.path === 'catalog.json');
    if (
      catalog &&
      (!summary.source.dirty ||
        !(await files.get(`${commitBase}/catalog.json`)))
    )
      await files.put(`${commitBase}/catalog.json`, catalog.data);
    await files.put(`${commitBase}/runs/${summary.id}/run.json`, runFile.data);
    await index.recordRun(runRecord(summary));
    return context.json({ status: 'created', url }, 201);
  }

  app.post('/api/v1/reindex', async (context) => {
    let total = 0;
    let indexed = 0;
    for await (const key of files.list('repos/')) {
      const match = RUN_FILE.exec(key);
      if (!match) continue;
      total += 1;
      const data = await readBytes(await files.get(key));
      if (!data) continue;
      let summary: RunSummary;
      try {
        summary = parseSummary(data);
      } catch {
        continue; // Not a shareable run.json; nothing to index.
      }
      if (await index.hasRun(summary.id)) continue;
      await index.recordRun(runRecord(summary));
      indexed += 1;
    }
    return context.json({ runs: total, indexed });
  });

  app.get('/api/v1/repos', async (context) =>
    context.json({ repos: await index.repos() }, 200, {
      'cache-control': 'no-cache',
    }),
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
        {
          'cache-control': 'no-cache',
        },
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
  // here so every page URL names one immutable commit.
  app.get('*', async (context) => {
    const url = new URL(context.req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const marker = path.indexOf('/-/');
    if (marker === -1) {
      const key = path.slice(1);
      const latest = validRepoKey(key) ? await index.latest(key) : undefined;
      if (latest) return context.redirect(`/${key}/-/${latest}/`);
      return dashboardPage(context, { base: '/', repo: key || undefined });
    }
    const key = path.slice(1, marker);
    const [ref = '', ...tail] = url.pathname.slice(marker + 3).split('/');
    const sha = validRepoKey(key)
      ? await index.resolve(key, decodeURIComponent(ref))
      : undefined;
    if (!sha)
      return dashboardPage(context, { base: '/', repo: key, missing: ref });
    if (sha !== ref)
      return context.redirect(
        `/${key}/-/${sha}/${tail.join('/')}${url.search}`,
      );
    return dashboardPage(context, {
      base: `/${key}/-/${sha}/`,
      repo: key,
      sha,
    });
  });

  /** The dashboard's index.html, told where this page's data lives. */
  async function dashboardPage(
    context: Context,
    page: { base: string; repo?: string; sha?: string; missing?: string },
  ) {
    const api = page.repo ? `/api/v1/repos/${page.repo}/-/` : undefined;
    return context.html(
      dashboardIndex(await assets.index(), {
        base: page.base,
        assets: '/assets/',
        share: {
          repos: '/api/v1/repos',
          ...(api ? { commits: `${api}commits` } : {}),
          ...(api && page.sha ? { data: `${api}${page.sha}/` } : {}),
          ...(page.repo ? { repo: page.repo } : {}),
          ...(page.missing ? { missing: page.missing } : {}),
        },
      }),
      page.sha || !page.repo ? 200 : 404,
      { 'cache-control': 'no-cache' },
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
      return context.json({ runs: await index.runs(key, sha) }, 200, {
        'cache-control': 'no-cache', // grows as runs are uploaded
      });
    if (['catalog.json', 'evals.json', 'suites.json'].includes(path)) {
      const data = await readBytes(
        await files.get(`${commitBase}/catalog.json`),
      );
      const catalog: RunCatalog = data
        ? JSON.parse(new TextDecoder().decode(data))
        : { catalog: [], evals: [], suites: [] };
      return context.json(
        path === 'catalog.json'
          ? { evals: catalog.catalog }
          : path === 'evals.json'
            ? { evals: catalog.evals }
            : { suites: catalog.suites },
        200,
        { 'cache-control': 'no-cache' },
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

function parseSummary(data: Uint8Array): RunSummary {
  let value: Partial<RunSummary>;
  try {
    value = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Rejected('run.json is not valid JSON');
  }
  const source = value.source;
  if (
    typeof value.id !== 'string' ||
    !isUuid(value.id) ||
    typeof value.evalId !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.startedAt !== 'string' ||
    !source ||
    typeof source.repo !== 'string' ||
    typeof source.project !== 'string' ||
    typeof source.commit !== 'string' ||
    !isSha(source.commit) ||
    typeof source.dirty !== 'boolean'
  )
    throw new Rejected(
      'run.json needs id, evalId, status, startedAt, and source { repo, project, commit, dirty }',
    );
  return value as RunSummary;
}

function runRecord(summary: RunSummary): RunRecord {
  return {
    repo: repoKey(summary.source),
    repoUrl: summary.source.repo,
    project: summary.source.project,
    sha: summary.source.commit,
    ...(summary.source.ref ? { ref: summary.source.ref } : {}),
    ...(summary.source.committedAt
      ? { committedAt: summary.source.committedAt }
      : {}),
    runId: summary.id,
    evalId: summary.evalId,
    ...(summary.suiteId ? { suiteId: summary.suiteId } : {}),
    status: summary.status,
    ...(typeof summary.score === 'number' ? { score: summary.score } : {}),
    startedAt: summary.startedAt,
    dirty: summary.source.dirty,
    summary,
  };
}

async function readBytes(
  body: ReadableStream<Uint8Array> | Uint8Array | null,
): Promise<Uint8Array | null> {
  if (!body) return null;
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(await new Response(body).arrayBuffer());
}
