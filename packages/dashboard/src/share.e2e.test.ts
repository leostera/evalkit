import { afterAll, beforeAll, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';
import { createDirectoryShareApp } from '../../share/src/node.js';

/** `evalkit run` → `evalkit share` → the shared dashboard, in a browser. */
const cli = resolve(import.meta.dir, '../../cli/src/index.ts');
let root: string;
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

// Async: the share server runs in this process and must keep serving.
const evalkit = async (project: string, ...args: string[]) => {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd: project,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1', GITLAB_CI: '', GITHUB_ACTIONS: '' },
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (status !== 0)
    throw new Error(`evalkit ${args.join(' ')} failed:\n${stdout}${stderr}`);
  return stdout;
};

beforeAll(async () => {
  await Bun.$`bun run --filter @evalkit/dashboard build`.quiet();
  root = await mkdtemp(join(tmpdir(), 'evalkit-share-e2e-'));
  const app = await createDirectoryShareApp({
    dir: join(root, 'server'),
    dashboardRoot: resolve(import.meta.dir, '..', 'dist'),
  });
  server = Bun.serve({ port: 0, fetch: app.fetch });
  browser = await puppeteer.launch({
    headless: true,
    args: process.env.CI === 'true' ? ['--no-sandbox'] : [],
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  void server?.stop(true);
  if (root) await rm(root, { recursive: true, force: true });
}, 30_000);

test('shared results are browsable by commit with a version picker', async () => {
  const project = join(root, 'project');
  await mkdir(join(project, 'evals'), { recursive: true });
  const evalSource = (message: string) => `
    export default {
      id: 'shared-greeting',
      name: 'Shared greeting',
      agent: { async start({ onEvent }) { return {
        async send() { await onEvent({ kind: 'message', role: 'assistant', content: 'hi', timestamp: new Date().toISOString() }); },
        async close() {},
      }; } },
      transcript: [{ kind: 'user', message: '${message}' }],
      scoring: [],
    };`;
  await writeFile(
    join(project, 'evals', 'greeting.eval.js'),
    evalSource('one'),
  );
  await writeFile(
    join(project, 'evalkit.config.js'),
    `export default { share: { url: 'http://127.0.0.1:${server.port}' } };`,
  );
  await writeFile(join(project, '.gitignore'), '_evalkit-*/\n');
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', project, ...args], { stdio: 'pipe' })
      .toString()
      .trim();
  git('init', '-q', '-b', 'main');
  git('remote', 'add', 'origin', 'git@gitlab.example.com:team/shared.git');
  git('add', '.');
  git(
    '-c',
    'user.email=t@example.com',
    '-c',
    'user.name=T',
    'commit',
    '-qm',
    'one',
  );
  const first = git('rev-parse', 'HEAD');
  await evalkit(project, 'run');
  const output = await evalkit(project, 'share');
  const url = `http://127.0.0.1:${server.port}/gitlab.example.com/team/shared/-/${first}`;
  expect(output).toContain(url);
  expect(output).toContain('1 new');

  await writeFile(
    join(project, 'evals', 'greeting.eval.js'),
    evalSource('two'),
  );
  git(
    '-c',
    'user.email=t@example.com',
    '-c',
    'user.name=T',
    'commit',
    '-qam',
    'two',
  );
  await evalkit(project, 'run');
  await evalkit(project, 'share');

  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${url}/runs`);
  await page.waitForFunction(
    () => document.body.innerText.includes('Shared greeting'),
    { timeout: 10_000 },
  );
  const versions = await page.$$eval(
    'select[aria-label="Version"] option',
    (options) => options.map((option) => option.textContent ?? ''),
  );
  expect(versions).toHaveLength(2);
  expect(versions.every((label) => label.includes('1/1 passed'))).toBe(true);
  // Switching versions keeps the page.
  const second = git('rev-parse', 'HEAD');
  await Promise.all([
    page.waitForNavigation(),
    page.select('select[aria-label="Version"]', second),
  ]);
  expect(new URL(page.url()).pathname).toBe(
    `/gitlab.example.com/team/shared/-/${second}/runs`,
  );
  await page.waitForFunction(
    () => document.body.innerText.includes('Shared greeting'),
    { timeout: 10_000 },
  );
  expect(errors).toEqual([]);
  await page.close();
}, 60_000);
