import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import {
  defineAgent,
  defineDataset,
  defineEval,
  predicate,
  user,
  defineSandbox,
  type RunResult,
  type Sandbox,
  type SandboxShell,
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
          content: `wrote it (${context.shell.sandbox.kind})`,
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
  sandbox?: Sandbox;
  fixtures?: FixtureSet;
  dir: string;
}): Promise<RunResult> {
  const [result] = await Effect.runPromise(
    runEval(scenario, {
      report: localReportStore(join(options.dir, 'reports')),
      workspaceRoot: join(options.dir, 'sandbox'),
      root: options.dir,
      ...(options.sandbox ? { sandbox: options.sandbox } : {}),
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
    sandbox: defineSandbox({
      id: 'broken',
      kind: 'container',
      dockerfile: './missing/Dockerfile',
      containerOpts: { runtime: 'definitely-not-docker' },
    }),
  });
  expect(result.status).toBe('errored');
  expect(result.error?.message).toContain(
    "Could not start the run's sandbox broken",
  );
  expect(result.error?.message).toContain('definitely-not-docker');
});

const hasDocker =
  spawnSync('docker', ['version', '--format', '{{.Server.Version}}']).status ===
  0;

describe.if(hasDocker)('container sandboxes', () => {
  test('runs the agent and scorers in a container removed after a pass', async () => {
    const dir = await root();
    const result = await run({
      dir,
      sandbox: defineSandbox({
        id: 'busybox',
        kind: 'container',
        image: 'busybox:stable',
      }),
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
      (await readRunManifest(join(dir, 'reports'), result.runId)).sandbox,
    ).toEqual({
      id: 'busybox',
      kind: 'container',
      image: 'busybox:stable',
      network: 'none',
    });
  }, 60_000);

  test('builds a Dockerfile once and reuses the image', async () => {
    const dir = await root();
    await writeFile(
      join(dir, 'Dockerfile'),
      'FROM busybox:stable\nRUN echo built > /built.txt\n',
    );
    const sandbox = defineSandbox({
      id: 'built',
      kind: 'container',
      dockerfile: './Dockerfile',
    });
    const first = await run({ dir, sandbox });
    const second = await run({ dir, sandbox });
    expect([first.status, second.status]).toEqual(['passed', 'passed']);
  }, 120_000);
});

/**
 * A remote sandbox in memory: the workspace is copied in at mount and back at
 * unmount, and every lifecycle call is recorded.
 */
function memorySandbox(
  calls: string[],
  options: { concurrency?: number } = {},
) {
  return defineSandbox({
    id: 'memory',
    kind: 'remote',
    ...options,
    async prepare() {
      calls.push('prepare');
    },
    async start(run) {
      calls.push(`start ${run.evalId}`);
      const files = new Map<string, string>();
      const shell: SandboxShell = {
        async exec(command) {
          const text = Array.isArray(command)
            ? command.join(' ')
            : String(command);
          // The one command the agent below runs: echo <text> > <file> && echo ...
          const write = /^echo "(.*)" > (\S+)/.exec(text);
          if (write) files.set(write[2]!, `${write[1]}\n`);
          return { exitCode: 0, stdout: 'remote\n', stderr: '' };
        },
        spawn() {
          throw new Error('not used');
        },
        readFile: async (file) => files.get(file) ?? '',
        writeFile: async (file, content) => {
          files.set(file, String(content));
        },
        list: async () => [...files.keys()],
      };
      return {
        shell,
        async mount(workspace) {
          calls.push('mount');
          for (const entry of await readdir(workspace.root))
            files.set(
              entry,
              await readFile(join(workspace.root, entry), 'utf8'),
            );
          return { root: '/remote/workspace', home: '/remote/home' };
        },
        async unmount(workspace) {
          calls.push('unmount');
          for (const [file, content] of files)
            await writeFile(join(workspace.root, file), content);
        },
        async stop({ keep }) {
          calls.push(`stop keep=${keep}`);
        },
      };
    },
    async teardown() {
      calls.push('teardown');
    },
  });
}

test('a remote sandbox: prepared once, mounted, scored inside, unmounted, stopped, torn down', async () => {
  const dir = await root();
  const calls: string[] = [];
  const sandbox = memorySandbox(calls);
  const results = await Effect.runPromise(
    runEval(scenario, {
      report: localReportStore(join(dir, 'reports')),
      workspaceRoot: join(dir, 'sandbox'),
      root: dir,
      sandbox,
      repeat: 2,
    }),
  );
  expect(results.map((result) => result.status)).toEqual(['passed', 'passed']);
  expect(calls.filter((call) => call === 'prepare')).toHaveLength(1);
  expect(calls.at(-1)).toBe('teardown');
  // Each run: start, mount, then unmount before stop.
  const run = calls.filter((call) => call !== 'prepare' && call !== 'teardown');
  for (const step of ['start shell', 'mount', 'unmount', 'stop keep=false'])
    expect(run.filter((call) => call === step)).toHaveLength(2);
  expect(run.indexOf('unmount')).toBeLessThan(run.indexOf('stop keep=false'));
  // The note came back from the sandbox, so it is in the snapshot.
  const summary = await readRunSummary(join(dir, 'reports'), results[0]!.runId);
  expect(summary.artifacts?.map((entry) => entry.path)).toContain(
    'candidate/note.txt',
  );
  const manifest = await readRunManifest(
    join(dir, 'reports'),
    results[0]!.runId,
  );
  expect(manifest.sandbox).toEqual({ id: 'memory', kind: 'remote' });
});

test("a run's sandbox: the cell's sandbox parameter, then the scenario's, then the config's", async () => {
  const dir = await root();
  const calls: string[] = [];
  const memory = memorySandbox(calls);
  const host = defineSandbox({ id: 'here', kind: 'host' });
  const sandboxes = { memory, here: host };
  const sandboxOf = async (options: {
    scenario?: Sandbox | string;
    fallback?: Sandbox | string;
    parameters?: Record<string, string>;
  }) => {
    const [result] = await Effect.runPromise(
      runEval(
        {
          ...scenario,
          ...(options.scenario ? { sandbox: options.scenario } : {}),
        },
        {
          report: localReportStore(join(dir, 'reports')),
          workspaceRoot: join(dir, 'sandbox'),
          root: dir,
          sandboxes,
          ...(options.fallback ? { sandbox: options.fallback } : {}),
          ...(options.parameters ? { parameters: options.parameters } : {}),
        },
      ),
    );
    return (await readRunManifest(join(dir, 'reports'), result!.runId)).sandbox
      ?.id;
  };
  expect(await sandboxOf({})).toBe('host');
  expect(await sandboxOf({ fallback: 'memory' })).toBe('memory');
  expect(await sandboxOf({ fallback: 'memory', scenario: 'here' })).toBe(
    'here',
  );
  expect(
    await sandboxOf({ scenario: 'here', parameters: { sandbox: 'memory' } }),
  ).toBe('memory');
  await expect(sandboxOf({ scenario: 'gone' })).rejects.toThrow(
    "not in the config's sandboxes (memory, here)",
  );
});

test("a sandbox's concurrency caps its runs at once", async () => {
  const dir = await root();
  let running = 0;
  let most = 0;
  const slow = defineAgent({
    identity: { id: 'slow', kind: 'in-process' },
    async start() {
      return {
        async send() {
          running += 1;
          most = Math.max(most, running);
          await new Promise((resolve) => setTimeout(resolve, 50));
          running -= 1;
          return 'done';
        },
      };
    },
  });
  await Effect.runPromise(
    runEval(
      defineEval({
        id: 'slow',
        agent: slow,
        transcript: [user('go')],
        scoring: [],
      }),
      {
        report: localReportStore(join(dir, 'reports')),
        workspaceRoot: join(dir, 'sandbox'),
        root: dir,
        sandbox: defineSandbox({ id: 'one', kind: 'host', concurrency: 1 }),
        repeat: 4,
        concurrency: 4,
      },
    ),
  );
  expect(most).toBe(1);
});
