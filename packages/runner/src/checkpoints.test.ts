import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import {
  defineAgent,
  defineEval,
  expectToolCall,
  predicate,
  judge,
  user,
  parseTrajectoryJsonl,
  canonicalParameters,
  type ReportStore,
  type ScoreValue,
} from '@evalkit/core';
import {
  localReportStore,
  readRunManifest,
  readRunSummary,
  readTrialManifest,
  readTrialScoring,
  readTrialSummary,
  readTrialEvents,
  runEval,
} from './index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'evalkit-checkpoint-'));
  roots.push(dir);
  return dir;
}
const stamp = () => new Date().toISOString();

function writerAgent(options: { first?: string; emitTool?: boolean } = {}) {
  const sends: string[] = [];
  let closed = 0;
  const agent = defineAgent({
    async start({ context, onEvent }) {
      return {
        async send(message: string) {
          sends.push(message);
          if (options.emitTool !== false && sends.length === 1) {
            await onEvent({
              kind: 'tool-call',
              id: 'call-1',
              name: 'write_file',
              arguments: { contents: '2112', path: 'number.txt' },
              timestamp: stamp(),
            });
            await onEvent({
              kind: 'tool-result',
              id: 'call-1',
              result: { ok: false },
              timestamp: stamp(),
            });
          }
          await writeFile(
            join(context.workspace.root, 'number.txt'),
            sends.length === 1 ? (options.first ?? '2112') : '2113',
          );
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: sends.length === 1 ? 'Hello there!' : 'Revised.',
            timestamp: stamp(),
          });
        },
        async close() {
          closed++;
        },
      };
    },
  });
  return {
    agent,
    sends,
    get closed() {
      return closed;
    },
  };
}
function fakeJudge(
  grade: (request: {
    name: string;
    rubric: string;
    placement: string;
    evidence: { turn?: unknown[]; trajectory?: unknown[] };
  }) => ScoreValue | boolean,
  options: { tools?: boolean; invalid?: boolean } = {},
) {
  const requests: Array<{
    name: string;
    rubric: string;
    placement: string;
    evidence: { turn?: unknown[]; trajectory?: unknown[] };
  }> = [];
  let closed = 0;
  const agent = defineAgent({
    identity: { id: 'fake-judge', kind: 'in-process' },
    async start({ context, onEvent }) {
      let verdict: ScoreValue | boolean | undefined;
      return {
        async send(message: string) {
          const request = JSON.parse(message) as (typeof requests)[number];
          requests.push(request);
          if (options.tools) {
            await onEvent({
              kind: 'tool-call',
              id: 'judge-tool',
              name: 'inspect',
              arguments: { path: 'judge-tool.txt' },
              timestamp: stamp(),
            });
            await writeFile(
              join(context.workspace.root, 'judge-tool.txt'),
              'private judge workspace',
            );
            await onEvent({
              kind: 'tool-result',
              id: 'judge-tool',
              result: { ok: true },
              timestamp: stamp(),
            });
          }
          verdict = grade(request);
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: options.invalid ? 'not-json' : JSON.stringify(verdict),
            timestamp: stamp(),
          });
          await onEvent({
            kind: 'turn-completed',
            turn: 1,
            usage: { inputTokens: 7, outputTokens: 3 },
            timestamp: stamp(),
          });
        },
        async close() {
          closed++;
          await onEvent({
            kind: 'completed',
            ...(options.invalid ? {} : { output: verdict }),
            timestamp: stamp(),
          });
        },
      };
    },
  });
  return {
    agent,
    requests,
    get closed() {
      return closed;
    },
  };
}

const fileIs = (value: string) =>
  predicate(`file-is-${value}`, async ({ artifacts }) => {
    const content = await readFile(
      join(artifacts.candidate.root, 'number.txt'),
      'utf8',
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    return content === value;
  });
const scenario = (
  agent: ReturnType<typeof writerAgent>['agent'],
  failfast?: boolean,
) =>
  defineEval({
    id: 'write-revise',
    agent,
    transcript: [
      user('first'),
      predicate(
        'greeting',
        ({ turn }) =>
          turn?.lastAssistantText === 'Hello there!' &&
          turn.assistantMessages.length === 1 &&
          turn.toolCalls[0]?.resultObservation === 'observed' &&
          JSON.stringify(turn.toolCalls[0]?.result) === '{"ok":false}',
      ),
      expectToolCall({
        name: 'write_file',
        arguments: { path: 'number.txt', contents: '2112' },
      }),
      fileIs('2112'),
      user('revise'),
      predicate('no-old-call', ({ turn }) => turn?.toolCalls.length === 0),
      fileIs('2113'),
    ],
    scoring: [
      predicate('final-state', async ({ artifacts }) =>
        (await readFile(
          join(artifacts.candidate.root, 'number.txt'),
          'utf8',
        )) === '2113'
          ? 1
          : 0,
      ),
    ],
    policy: { failfast },
  });

// Helper deliberately checks the JSON schema as well as the returned result.
test('interleaves checks with sends and records turn-local evidence in v3 reports', async () => {
  const dir = await root();
  const aut = writerAgent();
  const result = await Effect.runPromise(
    runEval(scenario(aut.agent), { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('completed');
  expect(result.scoring?.passed).toBe(true);
  expect(result.scoring?.overall).toBe(1);
  expect(aut.sends).toEqual(['first', 'revise']);
  expect(aut.closed).toBe(1);
  expect((await readRunManifest(dir, result.runId)).schemaVersion).toBe(3);
  expect(
    (await readTrialManifest(dir, result.runId, result.trialId)).schemaVersion,
  ).toBe(3);
  const scoring = await readTrialScoring(dir, result.runId, result.trialId);
  expect(scoring.checkpoints?.map((c) => c.status)).toEqual([
    'passed',
    'passed',
    'passed',
    'passed',
    'passed',
  ]);
  const events = await readTrialEvents(dir, result.runId, result.trialId);
  const matched = scoring.checkpoints![1]!.matchedToolCall!;
  expect(events[matched.eventIndex]).toMatchObject({
    source: 'aut',
    kind: 'tool-call',
    id: matched.id,
  });
  expect(events.some((event) => event.kind === 'checkpoint-completed')).toBe(
    true,
  );
  expect(
    parseTrajectoryJsonl(
      await readFile(
        join(dir, result.runId, 'trials', result.trialId, 'trajectory.jsonl'),
        'utf8',
      ),
    ),
  ).toHaveLength(events.length);
  expect(canonicalParameters({ a: 1, b: 2 })).toBe(
    canonicalParameters({ b: 2, a: 1 }),
  );
});

test('failfast stops subsequent prompts but closes, snapshots, and scores partial evidence', async () => {
  const dir = await root();
  const aut = writerAgent({ first: 'wrong' });
  const evaluation = scenario(aut.agent, true);
  evaluation.scoring.push(
    predicate('partial', () => 1, { supportsPartial: true }),
  );
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(aut.sends).toEqual(['first']);
  expect(aut.closed).toBe(1);
  expect(result.status).toBe('completed');
  expect(result.scoring).toMatchObject({
    passed: false,
    skippedScorers: ['final-state'],
  });
  expect(result.scoring?.results.map((s) => s.name)).toEqual(['partial']);
  expect(result.scoring?.checkpoints?.map((c) => c.status)).toEqual([
    'passed',
    'passed',
    'failed',
    'skipped',
    'skipped',
  ]);
  expect(await readRunSummary(dir, result.runId)).toMatchObject({
    status: 'completed',
    passed: 0,
    failed: 1,
  });
  expect(
    (await readTrialSummary(dir, result.runId, result.trialId)).status,
  ).toBe('completed');
  const events = await readTrialEvents(dir, result.runId, result.trialId);
  expect(
    events.filter((e) => e.kind === 'transcript-step-skipped'),
  ).toHaveLength(3);
  expect(
    await readFile(
      join(
        dir,
        result.runId,
        'trials',
        result.trialId,
        'artifacts',
        'candidate',
        'number.txt',
      ),
      'utf8',
    ),
  ).toBe('wrong');
});

test('without failfast a failing check does not erase failure or prevent later turns', async () => {
  const dir = await root();
  const aut = writerAgent({ first: 'wrong' });
  const result = await Effect.runPromise(
    runEval(scenario(aut.agent, false), { report: localReportStore(dir) }),
  );
  expect(aut.sends).toEqual(['first', 'revise']);
  expect(result.status).toBe('completed');
  expect(result.scoring?.overall).toBe(1);
  expect(result.scoring?.passed).toBe(false);
  expect(result.scoring?.checkpoints?.[2]?.status).toBe('failed');
});

test('check errors stop regardless of failfast, remain distinct from false, and close the session', async () => {
  const dir = await root();
  const aut = writerAgent();
  const evaluation = defineEval({
    id: 'check-error',
    agent: aut.agent,
    transcript: [
      user('first'),
      predicate('invalid', () => ({
        value: 0.5,
        evidence: { notJson: undefined! },
      })),
      user('second'),
    ],
    scoring: [],
  });
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('failed');
  expect(result.scoring?.checkpoints?.[0]?.status).toBe('error');
  expect(result.scoring?.checkpoints?.[0]?.passed).toBeUndefined();
  expect(result.scoring?.passed).toBe(false);
  expect(aut.sends).toEqual(['first']);
  expect(aut.closed).toBe(1);
});

test('checkpoint placement is validated and absent tool events do not match', async () => {
  const aut = writerAgent({ emitTool: false });
  expect(() =>
    defineEval({
      id: 'invalid-order',
      agent: aut.agent,
      transcript: [expectToolCall({ name: 'x' }), user('later')],
      scoring: [],
    }),
  ).toThrow('preceding user');
  const dir = await root();
  const evaluation = defineEval({
    id: 'no-tool',
    agent: aut.agent,
    transcript: [user('one'), expectToolCall({ name: 'write_file' })],
    scoring: [],
  });
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.scoring?.checkpoints?.[0]).toMatchObject({
    status: 'failed',
    value: 0,
  });
  expect(result.scoring?.passed).toBe(false);
});

for (const failingEvent of [
  'checkpoint-started',
  'checkpoint-completed',
] as const)
  test(`Effect scopes close the session and workspace when ${failingEvent} persistence fails`, async () => {
    const dir = await root();
    const aut = writerAgent();
    let workspaceRoot = '';
    const agent = defineAgent({
      async start(options) {
        workspaceRoot = options.context.workspace.root;
        return aut.agent.start(options);
      },
    });
    const local = localReportStore(dir);
    const brokenReport: ReportStore = {
      async startRun(metadata) {
        const writer = await local.startRun(metadata);
        return {
          location: writer.location,
          finalize: (summary) => writer.finalize(summary),
          async startTrial(trialMetadata) {
            const trial = await writer.startTrial(trialMetadata);
            return {
              writeScores: (scoring) => trial.writeScores(scoring),
              writeArtifact: (path, data) => trial.writeArtifact(path, data),
              finalize: (summary) => trial.finalize(summary),
              async appendEvent(event) {
                if (event.kind === failingEvent)
                  throw new Error('report unavailable');
                return trial.appendEvent(event);
              },
            };
          },
        };
      },
    };
    const result = await Effect.runPromise(
      runEval(
        defineEval({
          id: 'report-error',
          agent,
          transcript: [user('first'), predicate('check', () => true)],
          scoring: [],
        }),
        { report: brokenReport },
      ),
    );
    expect(result.status).toBe('failed');
    expect(result.error?.name).toBe('ReportError');
    expect(
      result.scoring?.checkpoints?.map((check) => check.status) ?? [],
    ).toEqual(failingEvent === 'checkpoint-completed' ? ['passed'] : []);
    expect(aut.closed).toBe(1);
    await expect(readFile(join(workspaceRoot, 'number.txt'))).rejects.toThrow();
    expect(
      (await readTrialSummary(dir, result.runId, result.trialId)).status,
    ).toBe('failed');
  });

test('boolean, thresholded numeric, and low scores are distinct checkpoint outcomes', async () => {
  const dir = await root();
  const aut = writerAgent();
  const evaluation = defineEval({
    id: 'score-modes',
    agent: aut.agent,
    transcript: [
      user('first'),
      predicate('yes', () => true),
      predicate('threshold', () => ({ value: 0.8, passed: true })),
      predicate('below', () => 0.8),
    ],
    scoring: [],
  });
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('completed');
  expect(result.scoring?.checkpoints?.map((c) => [c.status, c.value])).toEqual([
    ['passed', 1],
    ['passed', 0.8],
    ['failed', 0.8],
  ]);
  expect(result.scoring?.overall).toBeUndefined();
  expect(result.scoring?.passed).toBe(false);
});

test('the same predicate and judge rules execute inline and after close with distinct evidence', async () => {
  const dir = await root();
  const aut = writerAgent();
  const reviewer = fakeJudge(
    (request) => ({
      value: 0.9,
      passed: true,
      explanation: 'Helpful greeting',
      evidence: { placement: request.placement },
    }),
    { tools: true },
  );
  const rule = judge('reply quality', {
    rubric: 'The reply contains a greeting',
  });
  const deterministic = predicate(
    'has reply',
    ({ turn }) => turn?.lastAssistantText === 'Hello there!',
  );
  const evaluation = defineEval({
    id: 'unified-rules',
    agent: aut.agent,
    judge: reviewer.agent,
    transcript: [user('first'), deterministic, rule],
    scoring: [deterministic, rule],
  });
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('completed');
  expect(result.scoring?.passed).toBe(true);
  expect(result.scoring?.overall).toBe(0.95); // only the two final scorer values
  expect(
    result.scoring?.checkpoints?.map((entry) => [entry.kind, entry.value]),
  ).toEqual([
    ['predicate', 1],
    ['judge', 0.9],
  ]);
  expect(
    result.scoring?.results.map((entry) => [entry.kind, entry.value]),
  ).toEqual([
    ['predicate', 1],
    ['judge', 0.9],
  ]);
  expect(reviewer.requests.map((request) => request.placement)).toEqual([
    'transcript',
    'scoring',
  ]);
  expect(reviewer.requests[0]).toMatchObject({
    name: 'reply quality',
    rubric: 'The reply contains a greeting',
  });
  expect(reviewer.requests[0]?.evidence.turn).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'message', content: 'Hello there!' }),
    ]),
  );
  expect(reviewer.requests[1]?.evidence.trajectory?.length).toBeGreaterThan(
    reviewer.requests[0]?.evidence.turn?.length ?? 0,
  );
  const scoring = await readTrialScoring(dir, result.runId, result.trialId);
  expect(scoring.checkpoints?.[1]?.evidence).toEqual({
    placement: 'transcript',
  });
  expect(scoring.checkpoints?.[1]?.judge).toMatchObject({
    agent: { id: 'fake-judge', kind: 'in-process' },
    usage: { inputTokens: 7, outputTokens: 3 },
  });
  expect(scoring.checkpoints?.[1]?.judge?.events).toContainEqual(
    expect.objectContaining({ kind: 'tool-call', name: 'inspect' }),
  );
  const autEvents = await readTrialEvents(dir, result.runId, result.trialId);
  expect(
    autEvents.some(
      (event) => event.kind === 'tool-call' && event.id === 'judge-tool',
    ),
  ).toBe(false);
  expect(reviewer.closed).toBe(2);
  expect(aut.closed).toBe(1);
});

test('a failed inline judge triggers failfast; a partial final judge still cannot erase it', async () => {
  const dir = await root();
  const aut = writerAgent();
  const reviewer = fakeJudge((request) => request.placement !== 'transcript');
  const evaluation = defineEval({
    id: 'judge-failfast',
    agent: aut.agent,
    judge: reviewer.agent,
    transcript: [
      user('first'),
      judge('inline verdict', { rubric: 'Did it pass?' }),
      user('revise'),
      predicate('skipped', () => true),
    ],
    scoring: [
      judge('final verdict', {
        rubric: 'What was observed?',
        supportsPartial: true,
      }),
    ],
    policy: { failfast: true },
  });
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('completed');
  expect(result.scoring?.passed).toBe(false);
  expect(result.scoring?.checkpoints?.map((entry) => entry.status)).toEqual([
    'failed',
    'skipped',
  ]);
  expect(
    result.scoring?.results.map((entry) => [entry.kind, entry.value]),
  ).toEqual([['judge', 1]]);
  expect(reviewer.requests.map((request) => request.placement)).toEqual([
    'transcript',
    'scoring',
  ]);
  expect(aut.sends).toEqual(['first']);
});

test('judge configuration and provider errors fail explicitly in either placement', async () => {
  const aut = writerAgent();
  expect(() =>
    defineEval({
      id: 'no-provider',
      agent: aut.agent,
      transcript: [user('first'), judge('verdict', { rubric: 'Is it good?' })],
      scoring: [],
    }),
  ).toThrow('judge agent');
  const dir = await root();
  const reviewer = defineAgent({
    async start() {
      throw new Error('judge unavailable');
    },
  });
  const evaluation = defineEval({
    id: 'judge-error',
    agent: aut.agent,
    judge: reviewer,
    transcript: [
      user('first'),
      judge('verdict', { rubric: 'Is it good?' }),
      user('later'),
    ],
    scoring: [],
  });
  const failed = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(failed.status).toBe('failed');
  expect(failed.scoring?.checkpoints?.[0]).toMatchObject({
    kind: 'judge',
    status: 'error',
  });
  expect(aut.sends).toEqual(['first']);
  const finalOnly = defineEval({
    ...evaluation,
    id: 'final-judge-error',
    transcript: [user('first')],
    scoring: [judge('verdict', { rubric: 'Is it good?' })],
  });
  const scored = await Effect.runPromise(
    runEval(finalOnly, { report: localReportStore(dir) }),
  );
  expect(scored.status).toBe('completed');
  expect(scored.scoring?.results[0]).toMatchObject({
    kind: 'judge',
    passed: false,
    error: { name: 'ScoringError' },
  });
  expect(scored.scoring?.passed).toBe(false);
});

test('malformed judge verdicts fail explicitly and still close the judge and AUT sessions', async () => {
  const dir = await root();
  const aut = writerAgent();
  const reviewer = fakeJudge(() => ({ value: 1 }), { invalid: true });
  const evaluation = defineEval({
    id: 'bad-judge-verdict',
    agent: aut.agent,
    judge: reviewer.agent,
    transcript: [
      user('first'),
      judge('verdict', { rubric: 'Is it good?' }),
      user('later'),
    ],
    scoring: [],
  });
  const result = await Effect.runPromise(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('failed');
  expect(result.scoring?.checkpoints?.[0]).toMatchObject({
    kind: 'judge',
    status: 'error',
  });
  expect(aut.sends).toEqual(['first']);
  expect(aut.closed).toBe(1);
  expect(reviewer.closed).toBe(1);
});

test('the shared reader still decodes existing v2 reports', async () => {
  const dir = await root();
  const runId = crypto.randomUUID(),
    trialId = crypto.randomUUID();
  const { mkdir } = await import('node:fs/promises');
  const path = join(dir, runId, 'trials', trialId);
  await mkdir(path, { recursive: true });
  await writeFile(
    join(dir, runId, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 2,
      runUri: `evalkit:run:${runId}`,
      evalId: 'old',
      startedAt: stamp(),
      status: 'completed',
    }),
  );
  await writeFile(
    join(dir, runId, 'summary.json'),
    JSON.stringify({
      status: 'completed',
      endedAt: stamp(),
      trialCount: 1,
      passed: 1,
      failed: 0,
    }),
  );
  await writeFile(
    join(path, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 2,
      runUri: `evalkit:run:${runId}`,
      trialUri: `evalkit:trial:${trialId}`,
      trialIndex: 0,
      evalId: 'old',
      startedAt: stamp(),
      status: 'completed',
    }),
  );
  await writeFile(
    join(path, 'summary.json'),
    JSON.stringify({
      status: 'completed',
      endedAt: stamp(),
      scoring: { results: [], passed: true },
    }),
  );
  await writeFile(
    join(path, 'scoring.json'),
    JSON.stringify({ results: [], passed: true }),
  );
  await writeFile(
    join(path, 'trajectory.jsonl'),
    `${JSON.stringify({ source: 'runner', kind: 'trial-started', timestamp: stamp() })}\n`,
  );
  expect((await readRunManifest(dir, runId)).schemaVersion).toBe(2);
  expect(
    (await readTrialScoring(dir, runId, trialId)).checkpoints,
  ).toBeUndefined();
  expect(await readTrialEvents(dir, runId, trialId)).toHaveLength(1);
});
