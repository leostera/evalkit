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
  // A typical clean-URL static host (serve, Workers assets, Pages): `/x` is
  // served from x, x.html, or x/index.html. No SPA fallback and no API.
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = join(
        root,
        'public',
        decodeURIComponent(new URL(request.url).pathname),
      );
      for (const candidate of [
        path,
        `${path}.html`,
        join(path, 'index.html'),
      ]) {
        const file = Bun.file(candidate);
        if ((await file.exists()) && !candidate.endsWith('/'))
          try {
            return new Response(file);
          } catch {
            /* directory */
          }
      }
      return new Response('not found', { status: 404 });
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

test('serves a read-only snapshot from a sub-path with clean URLs', async () => {
  const page = await browser.newPage();
  const failures: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('response', (response) => {
    // Browsers request /favicon.ico on their own; the snapshot ships none.
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
      failures.push(response.url());
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const text = (value: string) =>
    page.waitForFunction(
      (expected) => document.body.innerText.includes(expected),
      { timeout: 10_000 },
      value,
    );

  // Scenarios link to their own page, their agent, and their runs, under the mount path.
  await page.goto(`${origin}/share/`);
  await text('Read-only snapshot');
  await text('Snapshot greeting');
  const hrefs = await page.$$eval('a', (links) =>
    links.map((link) => link.getAttribute('href') ?? ''),
  );
  expect(hrefs).toContain('/share/agents?agent=snapshot-agent');
  expect(hrefs).toContain('/share/scenarios/snapshot-greeting');
  expect(hrefs.some((href) => href.startsWith('/share/runs?eval='))).toBe(true);

  // Following the runs link stays on clean URLs and filters to the eval.
  await page.click('a[href^="/share/runs?eval="]');
  await text('1 of 1 runs');
  expect(new URL(page.url()).pathname).toBe('/share/runs');

  // A deep link loads directly (reload or shared URL) without a rewrite rule.
  await page.goto(`${origin}/share/runs/${runId}`);
  await page.waitForFunction(() => /passed/i.test(document.body.innerText), {
    timeout: 10_000,
  });
  expect(new URL(page.url()).pathname).toBe(`/share/runs/${runId}`);

  // Down the hierarchy to a trial, whose page also loads directly.
  await page.click('button.view-trial');
  await page.waitForSelector('.trajectory');
  const trialPath = new URL(page.url()).pathname;
  expect(trialPath).toMatch(new RegExp(`^/share/runs/${runId}/trials/[^/]+$`));
  await page.goto(`${origin}${trialPath}`);
  await page.waitForSelector('.trajectory', { timeout: 10_000 });
  await page.goto(`${origin}/share/scenarios/snapshot-greeting`);
  await text('Trials per run');
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
  await page.close();
}, 30_000);
