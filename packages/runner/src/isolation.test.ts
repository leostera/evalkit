import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import {
  container,
  defineAgent,
  defineDataset,
  defineEval,
  predicate,
  user,
  type Isolation,
  type RunResult,
} from '@evalkit/core';
import {
  fixtureSet,
  localReportStore,
  readRunManifest,
  readRunSummary,
  runEval,
  type FixtureSet,
} from './index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const dir of roots.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'evalkit-isolation-'));
  roots.push(dir);
  return dir;
}

/** An agent whose tool runs through the run's shell, and reports what it saw. */
const shellAgent = defineAgent({
  identity: { id: 'shell-agent', kind: 'in-process' },
  async start({ context, transcript }) {
    return {
      async send(message: string) {
        const store = context.fixtures.store?.url ?? 'none';
        const command = `echo "${message}" > note.txt && echo ${store}`;
        transcript.assistant({
          content: [
            {
              type: 'tool_call',
              id: 'c1',
              name: 'bash',
              arguments: { command },
            },
          ],
        });
        const result = await context.shell.exec(command);
        transcript.toolResult('c1', result.stdout.trim());
        transcript.assistant({
          content: `wrote it (${context.shell.isolation})`,
        });
      },
    };
  },
});

const scenario = defineEval({
  id: 'shell',
  agent: shellAgent,
  transcript: [user('hello')],
  scoring: [
    // Scorers get the same shell.
    predicate(
      'wrote the note',
      async ({ context }) =>
        (await context.shell.readFile('note.txt')).trim() === 'hello',
    ),
  ],
});

async function run(options: {
  isolation?: Isolation;
  fixtures?: FixtureSet;
  dir: string;
}): Promise<RunResult> {
  const [result] = await Effect.runPromise(
    runEval(scenario, {
      report: localReportStore(join(options.dir, 'reports')),
      workspaceRoot: join(options.dir, 'sandbox'),
      root: options.dir,
      ...(options.isolation ? { isolation: options.isolation } : {}),
      ...(options.fixtures ? { fixtures: options.fixtures } : {}),
    }),
  );
  return result!;
}

test('agents and scorers share the run shell, on the host by default', async () => {
  const dir = await root();
  const result = await run({ dir });
  expect(result.status).toBe('passed');
  const summary = await readRunSummary(join(dir, 'reports'), result.runId);
  expect(summary.artifacts?.map((entry) => entry.path)).toContain(
    'candidate/note.txt',
  );
});

test('fixtures start with the first run and their output is attached to it', async () => {
  const dir = await root();
  await writeFile(
    join(dir, 'store.ts'),
    "console.log('store up'); Bun.serve({ port: 18791, fetch: () => new Response('ok') });",
  );
  const fixtures = fixtureSet(
    {
      store: {
        start: `${process.execPath} store.ts`,
        ready: 'http://localhost:18791/',
      },
    },
    { root: dir },
  );
  try {
    const result = await run({ dir, fixtures });
    expect(result.status).toBe('passed');
    const summary = await readRunSummary(join(dir, 'reports'), result.runId);
    expect(summary.attachments?.map((entry) => entry.name)).toContain(
      'logs/fixtures/store.log',
    );
    expect(
      await readFile(
        join(
          dir,
          'reports',
          result.runId,
          'artifacts',
          'attachments',
          'logs',
          'fixtures',
          'store.log',
        ),
        'utf8',
      ),
    ).toBe('store up\n');
  } finally {
    await fixtures.stop();
  }
});

test("fixtures are up before datasets load, so a dataset's onRun can seed one", async () => {
  const dir = await root();
  await writeFile(
    join(dir, 'store.ts'),
    "Bun.serve({ port: 18792, fetch: () => new Response('seeded') });",
  );
  const fixtures = fixtureSet(
    {
      store: {
        start: `${process.execPath} store.ts`,
        ready: 'http://localhost:18792/',
      },
    },
    { root: dir },
  );
  const seeded = defineDataset({
    id: 'seeded',
    onLoad: () => ({ value: '' }),
    onRun: async (_loaded, run) => ({
      value: await (await fetch(run.fixtures.store!.url)).text(),
    }),
  });
  const scenario_ = defineEval({
    id: 'seeds',
    agent: shellAgent,
    datasets: [seeded],
    transcript: [user('hello')],
    scoring: [
      predicate('saw the seed', ({ data }) => data.seeded === 'seeded'),
    ],
  });
  try {
    const [result] = await Effect.runPromise(
      runEval(scenario_, {
        report: localReportStore(join(dir, 'reports')),
        workspaceRoot: join(dir, 'sandbox'),
        root: dir,
        fixtures,
      }),
    );
    expect(result!.status).toBe('passed');
  } finally {
    await fixtures.stop();
  }
});

test('a container that cannot start errors the run, saying why', async () => {
  const dir = await root();
  const result = await run({
    dir,
    isolation: container({
      image: './missing/Dockerfile',
      runtime: 'definitely-not-docker',
    }),
  });
  expect(result.status).toBe('errored');
  expect(result.error?.message).toContain(
    "Could not set up the run's container",
  );
  expect(result.error?.message).toContain('definitely-not-docker');
});

const hasDocker =
  spawnSync('docker', ['version', '--format', '{{.Server.Version}}']).status ===
  0;

describe.if(hasDocker)('container isolation', () => {
  test('runs the agent and scorers in a container removed after a pass', async () => {
    const dir = await root();
    const result = await run({
      dir,
      isolation: container({ image: 'busybox:stable' }),
    });
    expect(result.status).toBe('passed');
    const summary = await readRunSummary(join(dir, 'reports'), result.runId);
    expect(summary.artifacts?.map((entry) => entry.path)).toContain(
      'candidate/note.txt',
    );
    expect(
      spawnSync('docker', ['inspect', `evalkit-${result.runId}`]).status,
    ).not.toBe(0);
    expect(
      (await readRunManifest(join(dir, 'reports'), result.runId)).isolation,
    ).toEqual({ kind: 'container', image: 'busybox:stable', network: 'none' });
  }, 60_000);

  test('builds a Dockerfile once and reuses the image', async () => {
    const dir = await root();
    await writeFile(
      join(dir, 'Dockerfile'),
      'FROM busybox:stable\nRUN echo built > /built.txt\n',
    );
    const isolation = container({ image: './Dockerfile' });
    const first = await run({ dir, isolation });
    const second = await run({ dir, isolation });
    expect([first.status, second.status]).toEqual(['passed', 'passed']);
  }, 120_000);
});
