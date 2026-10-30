import { afterEach, expect, test } from 'bun:test';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dir, 'index.ts');
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function project(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'evalkit-run-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), content);
  }
  return root;
}

const scenario = (id: string, reply: string, extra = '') => `
const agent = { async start() { return { async send() { return ${JSON.stringify(reply)}; } }; } };
export default {
  id: '${id}', agent, transcript: [{ kind: 'user', message: 'hi' }],
  scoring: [{ kind: 'predicate', name: 'says ok', passAt: 0.5, run: ({ output }) => output === 'ok' ? 1 : 0 }],
  ${extra}
};`;

function spawn(root: string, args: string[]) {
  return Bun.spawn(['bun', cli, 'run', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

async function run(root: string, args: string[]) {
  const child = spawn(root, args);
  const [out, err, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, status };
}

test('prints one line per scenario, a summary, and a JUnit report', async () => {
  const root = await project({
    'scenarios/support/good.eval.js': scenario('good', 'ok'),
    'scenarios/support/bad.eval.js': scenario('bad', 'nope'),
    'scenarios/smoke.eval.js': scenario('smoke', 'ok'),
  });
  const result = await run(root, ['--junit', 'reports/junit.xml']);
  expect(result.status).toBe(1);
  expect(result.out).toContain('Running 3 scenarios');
  expect(result.out).toContain('✗ support/bad   says ok 0.0 (passes at 0.5)');
  expect(result.out).toContain('✓ support/good');
  expect(result.out).toContain('2 passed · 1 failed · 3 scenarios in');
  expect(result.out).not.toContain('{}');
  const junit = await readFile(join(root, 'reports/junit.xml'), 'utf8');
  expect(junit).toContain('<testsuite name="support" tests="2" failures="1"');
  expect(junit).toContain('<testsuite name="default" tests="1" failures="0"');
  expect(junit).toContain('<failure message="says ok 0.0 (passes at 0.5)">');

  const suite = await run(root, ['--suite', 'support', '--json']);
  const lines = suite.out
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(lines.at(-1)).toMatchObject({
    summary: { passed: 1, failed: 1, cancelled: 0, scenarios: 2 },
  });
  expect(lines[0].outcome).toBeDefined();
});

test('a broken file only blocks the selections that include it', async () => {
  const root = await project({
    'scenarios/ok.eval.js': scenario('ok', 'ok'),
    'scenarios/billing/refunds.eval.js':
      'throw new Error("API_TOKEN is not set");',
  });
  const healthy = await run(root, ['ok']);
  expect(healthy.status).toBe(0);
  expect(healthy.out).toContain(
    'scenarios/billing/refunds.eval.js failed to load',
  );
  expect(healthy.out).toContain('API_TOKEN is not set');

  const everything = await run(root, []);
  expect(everything.status).toBe(1);
  expect(everything.err).toContain('--skip-broken');

  const skipping = await run(root, ['--skip-broken']);
  expect(skipping.status).toBe(1);
  expect(skipping.out).toContain('1 passed');

  const dry = await run(root, ['--dry-run']);
  expect(dry.status).toBe(0);
  expect(JSON.parse(dry.out).cells).toBe(1);
  expect(dry.err).toContain('failed to load');
});

test('Ctrl+C finalizes running trials as cancelled and exits 130', async () => {
  const root = await project({
    'scenarios/hang.eval.js': `
const agent = { async start() { return { send: () => new Promise(() => {}) }; } };
export default { id: 'hang', agent, transcript: [{ kind: 'user', message: 'hi' }], scoring: [] };`,
  });
  const child = spawn(root, []);
  const reports = join(root, '_evalkit-results');
  // Wait until the trial has started before interrupting.
  for (let attempt = 0; attempt < 200; attempt++) {
    const runs = await readdir(reports).catch(() => []);
    if (runs.length) {
      const trials = await readdir(join(reports, runs[0]!, 'trials')).catch(
        () => [],
      );
      if (trials.length) break;
    }
    await Bun.sleep(25);
  }
  child.kill('SIGINT');
  const [out, status] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  expect(status).toBe(130);
  expect(out).toContain('Cancelling');
  expect(out).toContain('1 cancelled');
  const [runId] = await readdir(reports);
  const summary = JSON.parse(
    await readFile(join(reports, runId!, 'summary.json'), 'utf8'),
  );
  expect(summary.status).toBe('cancelled');
});
