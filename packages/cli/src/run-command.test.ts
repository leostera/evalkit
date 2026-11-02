import { afterEach, describe, expect, test } from 'bun:test';
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
  expect(result.out).toContain('2 passed · 1 failed · 3 runs in');
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

  // --repeat starts several runs of each scenario, reported one by one.
  const repeated = await run(root, ['good', '--repeat', '2', '--json']);
  const reported = repeated.out
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(reported.at(-1)).toMatchObject({
    summary: { passed: 2, failed: 0, runs: 2, scenarios: 1 },
  });
  const batches = reported.slice(0, -1).map((line) => line.result.batch);
  expect(batches.map((batch) => batch.index).sort()).toEqual([0, 1]);
  expect(new Set(batches.map((batch) => batch.id)).size).toBe(1);
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

test('Ctrl+C finalizes running runs as cancelled and exits 130', async () => {
  const root = await project({
    'scenarios/hang.eval.js': `
const agent = { async start() { return { send: () => new Promise(() => {}) }; } };
export default { id: 'hang', agent, transcript: [{ kind: 'user', message: 'hi' }], scoring: [] };`,
  });
  const child = spawn(root, []);
  const reports = join(root, '_evalkit-results');
  // Wait until the run has started before interrupting.
  for (let attempt = 0; attempt < 200; attempt++) {
    const runs = await readdir(reports).catch(() => []);
    const started =
      runs[0] &&
      (
        await readdir(join(reports, runs[0])).catch(() => [] as string[])
      ).includes('manifest.json');
    if (started) break;
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

describe('selecting a matrix, a suite, scenarios and axis values together', () => {
  const files = {
    'evalkit.config.js': `export default { matrix: { id: 'models', parameters: { model: ['luna', 'kimi'], toolchain: ['riot', 'dune'] } } };`,
    'scenarios/testing/unit.eval.js': scenario('unit', 'ok'),
    'scenarios/testing/property.eval.js': scenario('property', 'ok'),
    'scenarios/docs/readme.eval.js': scenario('readme', 'ok'),
  };
  const plan = async (args: string[]) => {
    const root = await project(files);
    const result = await run(root, [...args, '--dry-run']);
    return result.status === 0
      ? JSON.parse(result.out)
      : { status: result.status, error: result.err };
  };

  test('suite × axis values: -m and -s narrow to the scenarios in both', async () => {
    const daily = await plan([
      '-m',
      'models',
      '-s',
      'testing',
      '-a',
      'model=luna',
      '-a',
      'toolchain=riot',
    ]);
    expect(daily).toMatchObject({
      matrix: 'models',
      evals: ['property', 'unit'],
      cells: 2,
      parameters: { model: ['luna'], toolchain: ['riot'] },
    });
    // -s alone narrows the config's matrix the same way.
    expect(
      await plan(['-s', 'testing', '-a', 'model=luna', '-a', 'toolchain=riot']),
    ).toEqual(daily);
  });

  test('comma-separated values, and scenarios as arguments or -e', async () => {
    expect(
      await plan([
        '-s',
        'testing',
        '-a',
        'model=luna,kimi',
        '-a',
        'toolchain=dune',
      ]),
    ).toMatchObject({ evals: ['property', 'unit'], cells: 4 });
    expect(
      await plan(['-m', 'models', '-s', 'testing', 'unit', '-a', 'model=kimi']),
    ).toMatchObject({ evals: ['unit'], cells: 2 });
    expect(
      await plan(['-s', 'testing', '-e', 'unit', '-a', 'model=kimi']),
    ).toMatchObject({ evals: ['unit'], cells: 2 });
    expect(await plan(['readme', '-a', 'toolchain=riot'])).toMatchObject({
      matrix: 'models',
      evals: ['readme'],
      cells: 2,
    });
  });

  test('selections that cannot be met fail with a reason', async () => {
    const failure = async (args: string[], message: string) => {
      const result = await plan(args);
      expect(result.status).toBe(1);
      expect(result.error).toContain(message);
    };
    await failure(
      ['-s', 'testing', 'readme'],
      'Not in both matrix models and suite testing: readme',
    );
    await failure(['-s', 'nope'], 'Unknown suite: nope');
    await failure(['-m', 'nope'], 'Unknown matrix: nope');
    await failure(['-a', 'gpu=yes'], 'Unknown matrix axis: gpu');
    await failure(['-a', 'model'], '--select requires axis=value');
  });
});
