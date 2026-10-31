import { Effect } from 'effect';
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
  predicate,
  skip,
  user,
  parseTrajectoryJsonl,
  RunManifestSchema,
  RunSummarySchema,
  TrialManifestSchema,
  TrialScoringSchema,
  TrialSummarySchema,
} from '@evalkit/core';
import { localReportStore, ownerIsGone, runEval } from './index';

const execute = (
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
    async start({ onEvent }) {
      await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
      return {
        async send(message) {
          await onEvent({
            kind: 'message',
            role: 'user',
            content: message,
            timestamp: new Date().toISOString(),
          });
          const content =
            typeof response === 'string' ? response : await response();
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
          });
        },
        async close() {
          await onEvent({
            kind: 'completed',
            timestamp: new Date().toISOString(),
          });
        },
      };
    },
  });
}

describe('runEval', () => {
  test('streams a trajectory, scores it, and writes a hierarchical report', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'eval-01',
      agent: testAgent('Hello back!'),
      transcript: [user('Hello')],
      scoring: [
        predicate('responded', ({ trajectory }) =>
          trajectory.events.some(
            (event) =>
              event.source === 'aut' &&
              event.kind === 'message' &&
              event.role === 'assistant',
          )
            ? 1
            : 0,
        ),
      ],
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b30',
      trialId: '0197f17c-4d89-7f81-9d42-6c497e6f6b31',
    });

    expect(result.status).toBe('completed');
    expect(result.scoring?.overall).toBe(1);
    expect(result.scoring?.passed).toBe(true);
    const runManifest = JSON.parse(
      await readFile(path.join(root, result.runId, 'manifest.json'), 'utf8'),
    );
    const trialManifest = JSON.parse(
      await readFile(
        path.join(
          root,
          result.runId,
          'trials',
          result.trialId!,
          'manifest.json',
        ),
        'utf8',
      ),
    );
    expect(runManifest).toMatchObject({
      evalId: 'eval-01',
      status: 'completed',
    });
    expect(trialManifest).toMatchObject({
      evalId: 'eval-01',
      status: 'completed',
    });
    expect(
      Schema.decodeUnknownSync(RunManifestSchema)(runManifest).status,
    ).toBe('completed');
    expect(
      Schema.decodeUnknownSync(TrialManifestSchema)(trialManifest).status,
    ).toBe('completed');

    const trajectory = await readFile(
      path.join(
        root,
        '0197f17c-4d89-7f81-9d42-6c497e6f6b30',
        'trials',
        '0197f17c-4d89-7f81-9d42-6c497e6f6b31',
        'trajectory.jsonl',
      ),
      'utf8',
    );
    expect(trajectory).toContain('"role":"assistant"');
    expect(trajectory).toContain('"kind":"scorer-completed"');
    expect(
      parseTrajectoryJsonl(trajectory).some(
        (event) => event.kind === 'scorer-completed',
      ),
    ).toBe(true);

    const scoring = JSON.parse(
      await readFile(
        path.join(
          root,
          '0197f17c-4d89-7f81-9d42-6c497e6f6b30',
          'trials',
          '0197f17c-4d89-7f81-9d42-6c497e6f6b31',
          'scoring.json',
        ),
        'utf8',
      ),
    );
    expect(scoring.results[0]).toMatchObject({
      name: 'responded',
      value: 1,
      passed: true,
    });
    expect(Schema.decodeUnknownSync(TrialScoringSchema)(scoring).passed).toBe(
      true,
    );
    const trialSummary = JSON.parse(
      await readFile(
        path.join(
          root,
          result.runId,
          'trials',
          result.trialId!,
          'summary.json',
        ),
        'utf8',
      ),
    );
    expect(
      Schema.decodeUnknownSync(TrialSummarySchema)(trialSummary).status,
    ).toBe('completed');
  });

  test('groups requested independent trials beneath one aggregate run', async () => {
    const root = await reportDirectory();
    const evaluation = defineEval({
      id: 'eval-07',
      agent: testAgent('Aye!'),
      transcript: [user('Hello')],
      scoring: [predicate('responded', () => 1)],
      policy: { trials: 3 },
    });

    const result = await execute(evaluation, {
      report: localReportStore(root),
      runId: '0197f17c-4d89-7f81-9d42-6c497e6f6b32',
    });

    expect(result.runId).toBe('0197f17c-4d89-7f81-9d42-6c497e6f6b32');
    expect(result.trialCount).toBe(3);
    expect(result.passed).toBe(3);
    expect(result.trials?.map((trial) => trial.trialId)).toHaveLength(3);
    expect(
      result.trials?.every((trial) => /^[0-9a-f-]{36}$/.test(trial.trialId)),
    ).toBe(true);
    for (const trial of result.trials ?? []) {
      await access(
        path.join(
          root,
          '0197f17c-4d89-7f81-9d42-6c497e6f6b32',
          'trials',
          trial.trialId,
          'summary.json',
        ),
      );
    }
    const summary = JSON.parse(
      await readFile(
        path.join(root, '0197f17c-4d89-7f81-9d42-6c497e6f6b32', 'summary.json'),
        'utf8',
      ),
    );
    expect(summary).toMatchObject({ trialCount: 3, passed: 3, failed: 0 });
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
      trialId: '0197f17c-4d89-7f81-9d42-6c497e6f6b3e',
    });

    expect(result.status).toBe('completed');
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
      trialId: '0197f17c-4d89-7f81-9d42-6c497e6f6b35',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe('completed');
    expect(result.scoring?.passed).toBe(true);
    expect(candidateSawEvaluatorData).toBe(false);
    expect(agentData).toEqual({ project: { goal: 'upper' } });
    await expect(access(candidateRoot)).rejects.toThrow();

    const trialRoot = path.join(
      root,
      '0197f17c-4d89-7f81-9d42-6c497e6f6b34',
      'trials',
      '0197f17c-4d89-7f81-9d42-6c497e6f6b35',
    );
    const manifest = Schema.decodeUnknownSync(TrialManifestSchema)(
      JSON.parse(await readFile(path.join(trialRoot, 'manifest.json'), 'utf8')),
    );
    expect(manifest.schemaVersion).toBe(5);
    expect(
      manifest.datasets?.map(({ id, visibility }) => [id, visibility]),
    ).toEqual([
      ['project', 'candidate'],
      ['answers', 'evaluator'],
    ]);
    expect(manifest.datasets?.[0]?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(
      await readFile(
        path.join(trialRoot, 'artifacts', 'candidate', 'agent-output.txt'),
        'utf8',
      ),
    ).toBe('CANDIDATE DATASET');
    await expect(
      access(path.join(trialRoot, 'artifacts', 'evaluator')),
    ).rejects.toThrow();
    const trajectory = parseTrajectoryJsonl(
      await readFile(path.join(trialRoot, 'trajectory.jsonl'), 'utf8'),
    );
    expect(
      trajectory.some(
        (event) =>
          event.source === 'aut' &&
          event.kind === 'message' &&
          event.content === 'Created output.',
      ),
    ).toBe(true);
  });

  test('loads computed datasets once and derives each trial with onRun', async () => {
    const root = await reportDirectory();
    let loads = 0;
    const seen: unknown[] = [];
    const accounts = defineDataset({
      id: 'accounts',
      onLoad: async () => {
        loads++;
        return { value: ['a', 'b', 'c'] };
      },
      onRun: ({ value }, trial) => ({
        value: (value as string[])[trial.trialIndex],
        files: { 'account.txt': `account ${trial.trialIndex}` },
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
      policy: { trials: 3 },
      transcript: [user('hi')],
      scoring: [],
    });
    const options = { report: localReportStore(root), concurrency: 1 };
    await execute(evaluation, options);
    await execute(evaluation, options);
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
    expect(result.status).toBe('completed');
    expect(sent).toEqual([
      'Use Riot (riot.ml) (seed number, answers undefined)',
    ]);
    const trajectory = parseTrajectoryJsonl(
      await readFile(
        path.join(
          result.reportLocation,
          'trials',
          result.trialId,
          'trajectory.jsonl',
        ),
        'utf8',
      ),
    );
    expect(
      trajectory.find((event) => event.kind === 'transcript-step-started'),
    ).toMatchObject({ message: sent[0] });

    const empty = await execute(
      defineEval({
        ...evaluation,
        id: 'eval-empty-message',
        transcript: [user(() => ' ')],
      }),
      { report: localReportStore(root) },
    );
    expect(empty.status).toBe('failed');
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

  test('retries a failed dataset load and fails only the trial', async () => {
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
    expect(first.status).toBe('failed');
    expect(first.error?.message).toContain('service unavailable');
    const second = await execute(evaluation, {
      report: localReportStore(root),
    });
    expect(second.status).toBe('completed');
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
    expect(escaping.status).toBe('failed');
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
    expect(colliding.status).toBe('failed');
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
                  usage: { totalTokens: 12 },
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
    expect(result.status).toBe('completed');
    expect(result.scoring?.passed).toBe(true);
    const trajectory = parseTrajectoryJsonl(
      await readFile(
        path.join(
          result.reportLocation,
          'trials',
          result.trialId,
          'trajectory.jsonl',
        ),
        'utf8',
      ),
    );
    expect(
      trajectory
        .filter((event) => event.source === 'aut')
        .map((event) => event.kind),
    ).toEqual(['tool-call', 'tool-result', 'message', 'turn-completed']);
    // The prompt is recorded so the trajectory reads as a conversation.
    expect(
      trajectory.filter((event) => event.kind === 'transcript-step-started'),
    ).toMatchObject([{ step: 0, message: 'Where is order 7?' }, { step: 1 }]);
    expect(
      trajectory.find(
        (event) => event.kind === 'transcript-step-started' && event.step === 1,
      ),
    ).not.toHaveProperty('message');
  });

  test('cancellation stops new trials and finalizes running ones as cancelled', async () => {
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
      policy: { trials: 4 },
      transcript: [user('hang'), user('never sent')],
      scoring: [predicate('never runs', () => 1, { supportsPartial: true })],
    });
    const seen: string[] = [];
    const running = execute(evaluation, {
      report: localReportStore(root),
      concurrency: 2,
      signal: controller.signal,
      onEvent: (trial, event) => {
        seen.push(`${trial.trialIndex}:${event.kind}`);
        if (event.kind === 'transcript-step-started') controller.abort();
      },
    });
    const result = await running;
    expect(result.status).toBe('cancelled');
    expect(started).toBeLessThanOrEqual(2);
    expect(closed).toBe(started);
    expect(result.trials?.every((trial) => trial.status === 'cancelled')).toBe(
      true,
    );
    expect(
      result.trials?.every((trial) => trial.scoring?.results.length === 0),
    ).toBe(true);
    expect(seen).toContain('0:trial-started');
    const summary = Schema.decodeUnknownSync(RunSummarySchema)(
      JSON.parse(
        await readFile(path.join(root, result.runId, 'summary.json'), 'utf8'),
      ),
    );
    expect(summary).toMatchObject({
      status: 'cancelled',
      passed: 0,
      failed: 0,
      cancelled: started,
    });
    const manifest = Schema.decodeUnknownSync(RunManifestSchema)(
      JSON.parse(
        await readFile(path.join(root, result.runId, 'manifest.json'), 'utf8'),
      ),
    );
    expect(manifest.process?.pid).toBe(process.pid);
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

  test('persists a partial trajectory when the AUT fails', async () => {
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
      trialId: '0197f17c-4d89-7f81-9d42-6c497e6f6b3b',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatchObject({
      name: 'AutExecutionError',
      message: 'boom',
    });
    const runManifest = JSON.parse(
      await readFile(path.join(root, result.runId, 'manifest.json'), 'utf8'),
    );
    const trialManifest = JSON.parse(
      await readFile(
        path.join(
          root,
          result.runId,
          'trials',
          result.trialId!,
          'manifest.json',
        ),
        'utf8',
      ),
    );
    expect(runManifest.status).toBe('failed');
    expect(trialManifest.status).toBe('failed');
    const trajectory = await readFile(
      path.join(
        root,
        '0197f17c-4d89-7f81-9d42-6c497e6f6b3a',
        'trials',
        '0197f17c-4d89-7f81-9d42-6c497e6f6b3b',
        'trajectory.jsonl',
      ),
      'utf8',
    );
    expect(trajectory).toContain('"role":"user"');
    expect(trajectory).toContain('"kind":"error"');
  });
});
