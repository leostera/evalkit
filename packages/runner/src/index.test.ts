import { Effect } from 'effect';
import type { RunResult } from '@evalkit/core';
import * as Schema from 'effect/Schema';
import { afterEach, describe, expect, test } from 'bun:test';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  defineAgent,
  defineDataset,
  defineEval,
  expectToolCall,
  metric,
  predicate,
  skip,
  user,
  messages,
  toolCalls,
  RunManifestSchema,
  RunScoringSchema,
  RunSummarySchema,
} from '@evalkit/core';
import { transcriptReply } from '@evalkit/core/transcript';
import { parseTranscript, validateTranscript } from '@leostera/atxf';
import {
  localReportStore,
  ownerIsGone,
  readRunEvents,
  readRunTranscript,
  runEval,
} from './index';

/** Runs a scenario once and returns its one run. */
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

const execute = (
  definition: Parameters<typeof runEval>[0],
  options: Parameters<typeof runEval>[1],
) => runOne(runEval(definition, options));

/** Runs a scenario and returns every run it started. */
const executeAll = (
  definition: Parameters<typeof runEval>[0],
  options: Parameters<typeof runEval>[1],
) => Effect.runPromise(runEval(definition, options));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function reportDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'evalkit-'));
  temporaryDirectories.push(directory);
  return directory;
}

function testAgent(response: string | (() => Promise<string>)) {
  return defineAgent({
    identity: {
      kind: 'test-agent',
      id: 'agent-18',
    },
    async start({ transcript }) {
      return {
        async send(message) {
          transcript.user(message);
          const content =
            typeof response === 'string' ? response : await response();
          transcript.assistant({ content });
        },
      };
    },
  });
}

describe('runEval', () => {
  test('records an ATXF transcript, scores it, and writes a hierarchical report', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'eval-01',
      agent: testAgent('Hello back!'),
      transcript: [user('Hello')],
      scoring: [
        predicate('responded', (context) =>
          messages(context, 'assistant').length ? 1 : 0,
        ),
      ],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b30',
    });

    expect(result.status).toBe('passed');
    expect(result.scoring?.overall).toBe(1);
    expect(result.scoring?.passed).toBe(true);
    const runDirectory = path.join(
      root,
      '0197f17c-4d89-7f81-9d42-6c497e6f6b30',
    );
    const manifest = JSON.parse(
      await readFile(path.join(runDirectory, 'manifest.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      schemaVersion: 7,
      evalId: 'eval-01',
      status: 'passed',
    });
    expect(manifest.batch).toBeUndefined();
    expect(Schema.decodeUnknownSync(RunManifestSchema)(manifest).status).toBe(
      'passed',
    );

    // The agent's session is a valid, sealed ATXF transcript; the adapter's
    // user message stands for the scripted one, so it is written once.
    const text = await readFile(
      path.join(runDirectory, 'transcript.atxf.jsonl'),
      'utf8',
    );
    expect(validateTranscript(text).ok).toBe(true);
    const transcript = parseTranscript(text);
    expect(
      transcript.records.map((record) =>
        record.type === 'message' ? record.role : record.type,
      ),
    ).toEqual(['user', 'assistant', 'seal']);
    // EvalKit's own events are kept apart, each placed in the transcript.
    const events = await readRunEvents(root, result.runId);
    expect(events.map((event) => event.kind)).toContain('scorer-completed');
    expect(events.at(-1)).toMatchObject({
      kind: 'run-completed',
      at: transcript.records[1]!.id,
    });

    const scoring = JSON.parse(
      await readFile(path.join(runDirectory, 'scoring.json'), 'utf8'),
    );
    expect(scoring.results[0]).toMatchObject({
      name: 'responded',
      value: 1,
      passed: true,
    });
    expect(Schema.decodeUnknownSync(RunScoringSchema)(scoring).passed).toBe(
      true,
    );
    const summary = JSON.parse(
      await readFile(path.join(runDirectory, 'summary.json'), 'utf8'),
    );
    expect(Schema.decodeUnknownSync(RunSummarySchema)(summary)).toMatchObject({
      status: 'passed',
      scoring: { passed: true },
    });
  });

  test('repeat starts independent runs that share a batch', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'eval-07',
      agent: testAgent('Aye!'),
      transcript: [user('Hello')],
      scoring: [predicate('responded', () => 1)],
      repeat: 3,
    });

    const runs = await executeAll(evaluation, {
      report: localReportStore(root),
    });

    expect(runs).toHaveLength(3);
    expect(new Set(runs.map((run) => run.runId)).size).toBe(3);
    expect(runs.every((run) => run.status === 'passed')).toBe(true);
    const batchId = runs[0]!.batch!.id;
    expect(runs.map((run) => run.batch)).toEqual([
      { id: batchId, index: 0, size: 3 },
      { id: batchId, index: 1, size: 3 },
      { id: batchId, index: 2, size: 3 },
    ]);
    for (const run of runs) {
      const manifest = JSON.parse(
        await readFile(path.join(root, run.runId, 'manifest.json'), 'utf8'),
      );
      expect(manifest.batch).toEqual(run.batch);
      await access(path.join(root, run.runId, 'summary.json'));
    }
    // The option overrides the scenario, and one run has no batch.
    const [single, ...rest] = await executeAll(evaluation, {
      report: localReportStore(root),
      repeat: 1,
    });
    expect(rest).toHaveLength(0);
    expect(single?.batch).toBeUndefined();
    await expect(
      executeAll(evaluation, {
        report: localReportStore(root),
        runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b32',
      }),
    ).rejects.toThrow('cannot be used with repeat');
  });

  test('selects a declared AUT runtime', async () => {
    const root = await reportDirectory();
    let selectedRuntime: string | undefined;
    const evaluation = defineEval({
      id: 'eval-08',
      agent: defineAgent({
        runtimes: {
          local: {
            kind: 'process',
            configuration: { command: 'test-agent' },
          },
        },
        async start({ context, runtime }) {
          selectedRuntime = context.runtime;
          expect(runtime).toEqual({
            kind: 'process',
            configuration: { command: 'test-agent' },
          });
          return { async send() {}, async close() {} };
        },
      }),
      transcript: [],
      scoring: [],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runtime: 'local',
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b33',
    });

    expect(result.status).toBe('passed');
    expect(selectedRuntime).toBe('local');
  });

  test('rejects an undeclared AUT runtime', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'eval-09',
      agent: testAgent('unused'),
      transcript: [],
      scoring: [],
    });

    await expect(
      execute(evaluation, {
        report: localReportStore(root),
        runtime: 'sandbox',
      }),
    ).rejects.toThrow('does not declare the requested sandbox runtime');
  });

  test('provisions isolated candidate and evaluator datasets', async () => {
    const root = await reportDirectory();
    const source = await reportDirectory();
    let candidateSawEvaluatorData = false;
    let candidateRoot = '';
    let agentData: unknown;
    await writeFile(path.join(source, 'starter.txt'), 'candidate dataset');
    const evaluation = defineEval({
      id: 'eval-0a',
      agent: defineAgent({
        async start({ context }) {
          agentData = context.data;
          return {
            async send() {
              candidateRoot = context.workspace.root;
              try {
                await readFile(
                  path.join(context.workspace.root, 'answers', 'hidden.txt'),
                );
                candidateSawEvaluatorData = true;
              } catch {
                // Evaluator-only datasets are materialized in a separate tree.
              }
              const starter = await readFile(
                path.join(context.workspace.root, 'project', 'starter.txt'),
                'utf8',
              );
              await writeFile(
                path.join(context.workspace.root, 'agent-output.txt'),
                starter.toUpperCase(),
              );
              return 'Created output.';
            },
          };
        },
      }),
      datasets: [
        defineDataset({
          id: 'project',
          files: source,
          value: { goal: 'upper' },
        }),
        defineDataset({
          id: 'answers',
          visibility: 'evaluator',
          files: {
            'hidden.txt': 'evaluator dataset',
            'copied.txt': { file: path.join(source, 'starter.txt') },
          },
          value: { expected: 'CANDIDATE DATASET' },
        }),
      ],
      transcript: [user('Create the output')],
      scoring: [
        predicate(
          'checks-both-workspaces',
          async ({ artifacts, data, output }) => {
            const written = await readFile(
              path.join(artifacts.candidate.root, 'agent-output.txt'),
              'utf8',
            );
            const hidden = await readFile(
              path.join(artifacts.evaluator.root, 'answers', 'hidden.txt'),
              'utf8',
            );
            const copied = await readFile(
              path.join(artifacts.evaluator.root, 'answers', 'copied.txt'),
              'utf8',
            );
            const expected = (data.answers as { expected: string }).expected;
            return written === expected &&
              hidden === 'evaluator dataset' &&
              copied === 'candidate dataset' &&
              output === 'Created output.' &&
              (data.project as { goal: string }).goal === 'upper'
              ? 1
              : 0;
          },
        ),
      ],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b34',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe('passed');
    expect(result.scoring?.passed).toBe(true);
    expect(candidateSawEvaluatorData).toBe(false);
    expect(agentData).toEqual({ project: { goal: 'upper' } });
    await expect(access(candidateRoot)).rejects.toThrow();

    const runRoot = path.join(root, '0197f17c-4d89-7f81-9d42-6c497e6f6b34');
    const manifest = Schema.decodeUnknownSync(RunManifestSchema)(
      JSON.parse(await readFile(path.join(runRoot, 'manifest.json'), 'utf8')),
    );
    expect(manifest.schemaVersion).toBe(7);
    expect(
      manifest.datasets?.map(({ id, visibility }) => [id, visibility]),
    ).toEqual([
      ['project', 'candidate'],
      ['answers', 'evaluator'],
    ]);
    expect(manifest.datasets?.[0]?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(
      await readFile(
        path.join(runRoot, 'artifacts', 'candidate', 'agent-output.txt'),
        'utf8',
      ),
    ).toBe('CANDIDATE DATASET');
    await expect(
      access(path.join(runRoot, 'artifacts', 'evaluator')),
    ).rejects.toThrow();
    const transcript = await readRunTranscript(root, path.basename(runRoot));
    expect(transcriptReply(transcript)).toBe('Created output.');
  });

  test('loads computed datasets once and derives each run with onRun', async () => {
    const root = await reportDirectory();
    let loads = 0;
    const seen: unknown[] = [];
    const accounts = defineDataset({
      id: 'accounts',
      onLoad: async () => {
        loads++;
        return { value: ['a', 'b', 'c'] };
      },
      onRun: ({ value }, run) => ({
        value: (value as string[])[run.batch?.index ?? 0],
        files: { 'account.txt': `account ${run.batch?.index ?? 0}` },
      }),
    });
    const evaluation = defineEval({
      id: 'eval-computed',
      agent: defineAgent({
        async start({ context }) {
          seen.push(context.data.accounts);
          return { send: async () => 'ok' };
        },
      }),
      datasets: [accounts],
      repeat: 3,
      transcript: [user('hi')],
      scoring: [],
    });
    const options = { report: localReportStore(root), concurrency: 1 };
    await executeAll(evaluation, options);
    await executeAll(evaluation, options);
    expect(loads).toBe(1);
    expect(seen).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  });

  test('a computed user message sees parameters and candidate data, never evaluator data', async () => {
    const root = await reportDirectory();
    const sent: string[] = [];
    const evaluation = defineEval({
      id: 'eval-computed-message',
      agent: defineAgent({
        async start() {
          return {
            send: async (message: string) => {
              sent.push(message);
              return 'ok';
            },
          };
        },
      }),
      datasets: [
        defineDataset({ id: 'phrases', value: { riot: 'Riot (riot.ml)' } }),
        defineDataset({
          id: 'answers',
          visibility: 'evaluator',
          value: 'secret',
        }),
      ],
      transcript: [
        user(
          ({ parameters, data, seed }) =>
            `Use ${(data.phrases as Record<string, string>)[String(parameters.toolchain)]}` +
            ` (seed ${typeof seed}, answers ${String(data.answers)})`,
        ),
      ],
      scoring: [],
    });
    const result = await execute(evaluation, {
      report: localReportStore(root),
      parameters: { toolchain: 'riot' },
    });
    expect(result.status).toBe('passed');
    expect(sent).toEqual([
      'Use Riot (riot.ml) (seed number, answers undefined)',
    ]);
    const events = await readRunEvents(root, result.runId);
    expect(
      events.find((event) => event.kind === 'transcript-step-started'),
    ).toMatchObject({ message: sent[0] });

    const empty = await execute(
      defineEval({
        ...evaluation,
        id: 'eval-empty-message',
        transcript: [user(() => ' ')],
      }),
      { report: localReportStore(root) },
    );
    expect(empty.status).toBe('errored');
    expect(empty.error?.message).toContain(
      'The user message at step 1 must compute a non-empty string',
    );
  });

  test('final scorers and later checkpoints see earlier checkpoint results', async () => {
    const root = await reportDirectory();
    let seenByCheckpoint: unknown;
    const verified = predicate('verified', () => ({
      value: 1,
      evidence: { stdout: 'Hello, World!' },
    }));
    const evaluation = defineEval({
      id: 'eval-checkpoint-evidence',
      agent: defineAgent({
        async start() {
          return { send: async () => 'done' };
        },
      }),
      transcript: [
        user('go'),
        verified,
        predicate('second', ({ checkpoints }) => {
          seenByCheckpoint = checkpoints.map((check) => check.name);
          return true;
        }),
      ],
      scoring: [
        predicate('prints hello', ({ checkpoints }) =>
          JSON.stringify(checkpoints[0]?.evidence).includes('Hello'),
        ),
      ],
    });
    const result = await execute(evaluation, {
      report: localReportStore(root),
    });
    expect(seenByCheckpoint).toEqual(['verified']);
    expect(result.scoring?.results[0]).toMatchObject({
      name: 'prints hello',
      passed: true,
    });
  });

  test('checkpoint(rule) finds a checkpoint by the rule itself, with typed evidence', async () => {
    const root = await reportDirectory();
    const builds = predicate('hello builds (renamed)', () => ({
      value: 1,
      evidence: { binary: '_build/hello.exe', stdout: 'Hello' },
    }));
    const notInTranscript = predicate('elsewhere', () => true);
    let beforeItRan: unknown = 'unset';
    let missing = '';
    const evaluation = defineEval({
      id: 'eval-checkpoint-lookup',
      agent: defineAgent({
        async start() {
          return { send: async () => 'done' };
        },
      }),
      transcript: [
        user('go'),
        predicate('first', ({ checkpoint }) => {
          beforeItRan = checkpoint(builds);
          return true;
        }),
        builds,
      ],
      scoring: [
        predicate('runs the binary', ({ checkpoint }) => {
          const evidence = checkpoint(builds)?.evidence;
          // Typed: a misspelt field would not compile.
          const stdout: string | undefined = evidence?.stdout;
          // @ts-expect-error evidence is typed, so a misspelt field is an error
          void evidence?.stdot;
          try {
            checkpoint(notInTranscript);
          } catch (error) {
            missing = (error as Error).message;
          }
          return (
            stdout === 'Hello' && evidence?.binary.endsWith('.exe') === true
          );
        }),
      ],
    });
    const result = await execute(evaluation, {
      report: localReportStore(root),
    });
    expect(beforeItRan).toBeUndefined();
    expect(missing).toContain(
      'checkpoint("elsewhere") is not a checkpoint in this scenario',
    );
    expect(result.scoring?.results[0]).toMatchObject({
      name: 'runs the binary',
      passed: true,
    });
  });

  test('scenario metrics are recorded beside scores and never decide pass or fail', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'eval-metrics',
      agent: defineAgent({
        async start() {
          return {
            send: async () => ({
              reply: 'done',
              toolCalls: [{ name: 'web_search', arguments: { q: 'opam' } }],
            }),
          };
        },
      }),
      transcript: [user('go')],
      scoring: [predicate('ok', () => true)],
      metrics: [
        metric(
          'web searches',
          (context) => toolCalls(context, 'web_search').length,
          { better: 'lower' },
        ),
        metric('nothing to measure', () => undefined),
        metric('broken', () => {
          throw new Error('no data');
        }),
      ],
    });
    const result = await execute(evaluation, {
      report: localReportStore(root),
    });
    expect(result.scoring?.passed).toBe(true);
    expect(result.scoring?.metrics).toEqual([
      expect.objectContaining({ name: 'agent time', builtIn: true }),
      // The call and the reply are two assistant messages: two steps.
      { name: 'steps', value: 2, better: 'lower', builtIn: true },
      { name: 'tool calls', value: 1, builtIn: true },
      { name: 'web searches', value: 1, better: 'lower' },
      { name: 'nothing to measure' },
      expect.objectContaining({
        name: 'broken',
        error: expect.objectContaining({ message: 'no data' }),
      }),
    ]);
    expect(() =>
      defineEval({
        ...evaluation,
        // @ts-expect-error built-in metric names are rejected by the type too
        metrics: [metric('tokens', () => 1)],
      }),
    ).toThrow('more than one metric named tokens');
  });

  test('retries a failed dataset load and fails only the run', async () => {
    const root = await reportDirectory();
    let attempts = 0;
    const flaky = defineDataset({
      id: 'flaky',
      onLoad: () => {
        attempts++;
        if (attempts === 1) throw new Error('service unavailable');
        return { value: 1 };
      },
    });
    const evaluation = defineEval({
      id: 'eval-flaky',
      agent: testAgent('ok'),
      datasets: [flaky],
      transcript: [user('hi')],
      scoring: [],
    });
    const first = await execute(evaluation, { report: localReportStore(root) });
    expect(first.status).toBe('errored');
    expect(first.error?.message).toContain('service unavailable');
    const second = await execute(evaluation, {
      report: localReportStore(root),
    });
    expect(second.status).toBe('passed');
    expect(attempts).toBe(2);
  });

  test('reads value files as JSON and JSONL relative to the root', async () => {
    const root = await reportDirectory();
    const project = await reportDirectory();
    await writeFile(path.join(project, 'facts.json'), '{"answer":42}');
    await writeFile(
      path.join(project, 'rows.jsonl'),
      '{"id":"a"}\n\n{"id":"b"}\n',
    );
    await writeFile(path.join(project, 'bad.jsonl'), '{"id":"a"}\nnope\n');
    let data: unknown;
    const evaluation = (
      datasets: Parameters<typeof defineEval>[0]['datasets'],
    ) =>
      defineEval({
        id: 'eval-files',
        agent: defineAgent({
          async start({ context }) {
            data = context.data;
            return { send: async () => {} };
          },
        }),
        datasets,
        transcript: [user('hi')],
        scoring: [],
      });
    await execute(
      evaluation([
        defineDataset({ id: 'facts', valueFile: 'facts.json' }),
        defineDataset({ id: 'rows', valueFile: 'rows.jsonl' }),
      ]),
      { report: localReportStore(root), root: project },
    );
    expect(data).toEqual({
      facts: { answer: 42 },
      rows: [{ id: 'a' }, { id: 'b' }],
    });
    const bad = await execute(
      evaluation([defineDataset({ id: 'bad', valueFile: 'bad.jsonl' })]),
      { report: localReportStore(root), root: project },
    );
    expect(bad.error?.message).toContain('bad.jsonl:2');
  });

  test('fails safely when dataset paths escape or collide', async () => {
    const root = await reportDirectory();
    const escaping = await execute(
      defineEval({
        id: 'eval-0b',
        agent: testAgent('unused'),
        datasets: [
          defineDataset({ id: 'out', files: { '../../outside.txt': 'nope' } }),
        ],
        transcript: [],
        scoring: [],
      }),
      { report: localReportStore(root) },
    );
    expect(escaping.status).toBe('errored');
    expect(escaping.error?.message).toContain('escapes its workspace');

    const colliding = await execute(
      defineEval({
        id: 'eval-0c',
        agent: testAgent('unused'),
        datasets: [
          defineDataset({
            id: 'first',
            mount: '.',
            files: { 'same.txt': 'a' },
          }),
          defineDataset({
            id: 'second',
            mount: '.',
            files: { 'same.txt': 'b' },
          }),
        ],
        transcript: [],
        scoring: [],
      }),
      { report: localReportStore(root) },
    );
    expect(colliding.status).toBe('errored');
    expect(colliding.error?.message).toContain(
      'Dataset second would overwrite same.txt',
    );
  });

  test('applies passAt, records skip() and leaves skips out of the average', async () => {
    const root = await reportDirectory();
    const result = await execute(
      defineEval({
        id: 'eval-scoring',
        agent: testAgent('hello'),
        transcript: [
          user('hi'),
          predicate('not here', () => skip('no tools in this turn')),
        ],
        scoring: [
          predicate('half', () => 0.5, { passAt: 0.5 }),
          predicate('n/a', () => skip('not applicable')),
          predicate('evidence', () => ({
            value: 1,
            evidence: { at: new Date('2026-01-01T00:00:00.000Z') },
          })),
        ],
      }),
      { report: localReportStore(root) },
    );
    expect(result.scoring?.passed).toBe(true);
    expect(result.scoring?.overall).toBe(0.75);
    expect(result.scoring?.results[1]).toMatchObject({
      name: 'n/a',
      skipped: true,
      explanation: 'not applicable',
    });
    expect(result.scoring?.results[1]?.value).toBeUndefined();
    expect(result.scoring?.results[2]?.evidence).toEqual({
      at: '2026-01-01T00:00:00.000Z',
    });
    expect(result.scoring?.checkpoints?.[0]?.status).toBe('skipped');
  });

  test('records returned turn results and needs no close()', async () => {
    const root = await reportDirectory();
    const result = await execute(
      defineEval({
        id: 'eval-returning',
        agent: defineAgent({
          async start() {
            return {
              async send() {
                return {
                  reply: 'Order 7 ships tomorrow.',
                  toolCalls: [
                    {
                      name: 'lookupOrder',
                      arguments: { id: 7 },
                      result: { eta: 'tomorrow' },
                    },
                  ],
                  usage: { total: 12 },
                };
              },
            };
          },
        }),
        transcript: [
          user('Where is order 7?'),
          expectToolCall({ name: 'lookupOrder', arguments: { id: 7 } }),
        ],
        scoring: [
          predicate('mentions eta', ({ output }) =>
            String(output).includes('tomorrow'),
          ),
        ],
      }),
      { report: localReportStore(root) },
    );
    expect(result.status).toBe('passed');
    expect(result.scoring?.passed).toBe(true);
    // A turn's result becomes messages: the call, its result, the reply.
    const transcript = await readRunTranscript(root, result.runId);
    expect(
      transcript.records.map((record) =>
        record.type === 'message' ? record.role : record.type,
      ),
    ).toEqual(['user', 'assistant', 'tool', 'assistant', 'seal']);
    expect(toolCalls({ transcript })).toMatchObject([
      { name: 'lookupOrder', arguments: { id: 7 }, isError: false },
    ]);
    const events = await readRunEvents(root, result.runId);
    expect(
      events.filter((event) => event.kind === 'transcript-step-started'),
    ).toMatchObject([{ step: 0, message: 'Where is order 7?' }, { step: 1 }]);
    expect(
      events.find(
        (event) => event.kind === 'transcript-step-started' && event.step === 1,
      ),
    ).not.toHaveProperty('message');
  });

  test('cancellation stops new runs and finalizes running ones as cancelled', async () => {
    const root = await reportDirectory();
    const controller = new AbortController();
    let started = 0;
    let closed = 0;
    const evaluation = defineEval({
      id: 'eval-cancel',
      agent: defineAgent({
        async start() {
          started++;
          return {
            // Never answers on its own: only cancellation ends the turn.
            send: () => new Promise<void>(() => {}),
            async close() {
              closed++;
            },
          };
        },
      }),
      repeat: 4,
      transcript: [user('hang'), user('never sent')],
      scoring: [predicate('never runs', () => 1, { supportsPartial: true })],
    });
    const seen: string[] = [];
    const runs = await executeAll(evaluation, {
      report: localReportStore(root),
      concurrency: 2,
      signal: controller.signal,
      onUpdate: (run, update) => {
        if (update.kind !== 'event') return;
        seen.push(`${run.batch?.index}:${update.event.kind}`);
        if (update.event.kind === 'transcript-step-started') controller.abort();
      },
    });
    // Runs that never started are not created at all.
    expect(runs).toHaveLength(started);
    expect(started).toBeLessThanOrEqual(2);
    expect(closed).toBe(started);
    expect(runs.every((run) => run.status === 'cancelled')).toBe(true);
    expect(runs.every((run) => run.scoring?.results.length === 0)).toBe(true);
    expect(seen).toContain('0:run-started');
    for (const run of runs) {
      const summary = Schema.decodeUnknownSync(RunSummarySchema)(
        JSON.parse(
          await readFile(path.join(root, run.runId, 'summary.json'), 'utf8'),
        ),
      );
      expect(summary.status).toBe('cancelled');
      const manifest = Schema.decodeUnknownSync(RunManifestSchema)(
        JSON.parse(
          await readFile(path.join(root, run.runId, 'manifest.json'), 'utf8'),
        ),
      );
      expect(manifest.process?.pid).toBe(process.pid);
    }
  });

  test('judges a running run interrupted only when its local owner is gone', () => {
    const hostname = os.hostname();
    expect(ownerIsGone(undefined)).toBe(false);
    expect(ownerIsGone({ pid: process.pid, hostname })).toBe(false);
    expect(ownerIsGone({ pid: 2 ** 22 + 12345, hostname })).toBe(true);
    expect(ownerIsGone({ pid: 2 ** 22 + 12345, hostname: 'elsewhere' })).toBe(
      false,
    );
  });

  test('persists a partial transcript when the AUT fails', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'eval-0d',
      agent: testAgent(async () => {
        throw new Error('boom');
      }),
      transcript: [user('Hello')],
      scoring: [],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b3a',
    });

    expect(result.status).toBe('errored');
    expect(result.error).toMatchObject({
      name: 'AutExecutionError',
      message: 'boom',
    });
    const manifest = JSON.parse(
      await readFile(path.join(root, result.runId, 'manifest.json'), 'utf8'),
    );
    expect(manifest.status).toBe('errored');
    const transcript = await readRunTranscript(root, result.runId);
    expect(messages({ transcript }, 'user')).toHaveLength(1);
    const events = await readRunEvents(root, result.runId);
    expect(events.map((event) => event.kind)).toContain('error');
  });
});
