import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Effect } from 'effect';
import puppeteer, { type Browser } from 'puppeteer';
import { defineEval, predicate, registerEvals, user } from '@evalkit/core';
import { localReportStore, runEval } from '../../runner/src/index.js';
import { buildDashboard } from '../../cli/src/dashboard-build.js';

/** A built snapshot must work from a sub-path with only a dumb static server. */
let root: string;
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let runId: string;

const evaluation = defineEval({
  id: 'snapshot-greeting',
  name: 'Snapshot greeting',
  agent: {
    identity: { kind: 'in-process', id: 'snapshot-agent' },
    async start({ context, onEvent }) {
      return {
        async send(message: string) {
          await writeFile(join(context.workspace.root, 'reply.txt'), message);
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: `Hello, ${message}`,
            timestamp: new Date().toISOString(),
          });
        },
        async close() {},
      };
    },
  },
  transcript: [user('Ada')],
  scoring: [predicate('greets', () => true)],
});

beforeAll(async () => {
  await Bun.$`bun run --filter @evalkit/dashboard build`;
  root = await mkdtemp(join(tmpdir(), 'evalkit-snapshot-e2e-'));
  const reportRoot = join(root, '_evalkit-results');
  runId = (
    await Effect.runPromise(
      runEval(evaluation, {
        report: localReportStore(reportRoot),
        workspaceRoot: join(root, '_evalkit-sandbox'),
      }),
    )
  ).runId;
  const outDir = join(root, 'public', 'share');
  await buildDashboard({
    registry: registerEvals([evaluation]),
    reportRoot,
    dashboardRoot: resolve(import.meta.dir, '..', 'dist'),
    outDir,
  });
  // No SPA fallback and no API: only files that exist are served.
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      let path = decodeURIComponent(new URL(request.url).pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = Bun.file(join(root, 'public', path));
      return (await file.exists())
        ? new Response(file)
        : new Response('not found', { status: 404 });
    },
  });
  browser = await puppeteer.launch({
    headless: true,
    args: process.env.CI === 'true' ? ['--no-sandbox'] : [],
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  if (root) await rm(root, { recursive: true, force: true });
});

test('serves a read-only snapshot from a sub-path with hash routes', async () => {
  const page = await browser.newPage();
  const failures: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('response', (response) => {
    // Browsers request /favicon.ico on their own; the snapshot ships none.
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      failures.push(response.url());
  });
  await page.goto(`http://127.0.0.1:${server.port}/share/#/runs`);
  await page.waitForFunction(
    () => document.body.innerText.includes('Read-only snapshot'),
    { timeout: 10_000 },
  );
  await page.waitForFunction(
    () => document.body.innerText.includes('Snapshot greeting'),
    { timeout: 10_000 },
  );
  await page.goto(`http://127.0.0.1:${server.port}/share/#/runs/${runId}`);
  await page.waitForFunction(() => /passed/i.test(document.body.innerText), {
    timeout: 10_000,
  });
  expect(new URL(page.url()).pathname).toBe('/share/');
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
  await page.close();
}, 30_000);
