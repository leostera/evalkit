import { afterEach, expect, test } from 'bun:test';
import type { RunResult } from '@evalkit/core';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import {
  defineAgent,
  defineEval,
  expectToolCall,
  predicate,
  user,
  canonicalParameters,
  type ReportStore,
} from '@evalkit/core';
import {
  localReportStore,
  readRunManifest,
  readRunSummary,
  readRunScoring,
  readRunEvents,
  readRunTranscript,
  runEval,
} from './index.js';

/** Runs a scenario once and returns its one run. */
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

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

function writerAgent(options: { first?: string; emitTool?: boolean } = {}) {
  const sends: string[] = [];
  let closed = 0;
  const agent = defineAgent({
    async start({ context, transcript }) {
      return {
        async send(message: string) {
          sends.push(message);
          if (options.emitTool !== false && sends.length === 1) {
            transcript.assistant({
              content: [
                {
                  type: 'tool_call',
                  id: 'call-1',
                  name: 'write_file',
                  arguments: { contents: '2112', path: 'number.txt' },
                },
              ],
            });
            transcript.toolResult(
              'call-1',
              { ok: false },
              { name: 'write_file' },
            );
          }
          await writeFile(
            join(context.workspace.root, 'number.txt'),
            sends.length === 1 ? (options.first ?? '2112') : '2113',
          );
          transcript.assistant({
            content: sends.length === 1 ? 'Hello there!' : 'Revised.',
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
          turn.assistantMessages.length === 2 &&
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
test('interleaves checks with sends and records turn-local evidence in v3+ reports', async () => {
  const dir = await root();
  const aut = writerAgent();
  const result = await runOne(
    runEval(scenario(aut.agent), { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('passed');
  expect(result.scoring?.passed).toBe(true);
  expect(result.scoring?.overall).toBe(1);
  expect(aut.sends).toEqual(['first', 'revise']);
  expect(aut.closed).toBe(1);
  expect((await readRunManifest(dir, result.runId)).schemaVersion).toBe(7);
  const scoring = await readRunScoring(dir, result.runId);
  expect(scoring.checkpoints?.map((c) => c.status)).toEqual([
    'passed',
    'passed',
    'passed',
    'passed',
    'passed',
  ]);
  // The match names the assistant message that made the call.
  const transcript = await readRunTranscript(dir, result.runId);
  const matched = scoring.checkpoints![1]!.matchedToolCall!;
  const message = transcript.records.find(
    (record) => record.type === 'message' && record.id === matched.messageId,
  );
  expect(message).toMatchObject({
    role: 'assistant',
    content: [{ type: 'tool_call', id: matched.id, name: 'write_file' }],
  });
  // A checkpoint's events are placed at the record it saw last.
  const events = await readRunEvents(dir, result.runId);
  const checked = events.find((event) => event.kind === 'checkpoint-completed');
  expect(checked?.at).toBe(
    transcript.records.find(
      (record) =>
        record.type === 'message' &&
        record.role === 'assistant' &&
        record.content.some(
          (block) => block.type === 'text' && block.text === 'Hello there!',
        ),
    )?.id,
  );
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
  const result = await runOne(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(aut.sends).toEqual(['first']);
  expect(aut.closed).toBe(1);
  expect(result.status).toBe('failed');
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
  expect((await readRunSummary(dir, result.runId)).status).toBe('failed');
  const events = await readRunEvents(dir, result.runId);
  expect(
    events.filter((e) => e.kind === 'transcript-step-skipped'),
  ).toHaveLength(3);
  expect(
    await readFile(
      join(dir, result.runId, 'artifacts', 'candidate', 'number.txt'),
      'utf8',
    ),
  ).toBe('wrong');
});

test('without failfast a failing check does not erase failure or prevent later turns', async () => {
  const dir = await root();
  const aut = writerAgent({ first: 'wrong' });
  const result = await runOne(
    runEval(scenario(aut.agent, false), { report: localReportStore(dir) }),
  );
  expect(aut.sends).toEqual(['first', 'revise']);
  expect(result.status).toBe('failed');
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
        evidence: { notJson: 1n },
      })),
      user('second'),
    ],
    scoring: [],
  });
  const result = await runOne(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('errored');
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
  const result = await runOne(
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
          writeScores: (scoring) => writer.writeScores(scoring),
          writeArtifact: (path, data) => writer.writeArtifact(path, data),
          finalize: (summary) => writer.finalize(summary),
          appendTranscript: (line) => writer.appendTranscript(line),
          writeSubagent: (id, text) => writer.writeSubagent(id, text),
          async appendEvent(event) {
            if (event.kind === failingEvent)
              throw new Error('report unavailable');
            return writer.appendEvent(event);
          },
        };
      },
    };
    const result = await runOne(
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
    expect(result.status).toBe('errored');
    expect(result.error?.name).toBe('ReportError');
    expect(
      result.scoring?.checkpoints?.map((check) => check.status) ?? [],
    ).toEqual(failingEvent === 'checkpoint-completed' ? ['passed'] : []);
    expect(aut.closed).toBe(1);
    await expect(readFile(join(workspaceRoot, 'number.txt'))).rejects.toThrow();
    expect((await readRunSummary(dir, result.runId)).status).toBe('errored');
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
  const result = await runOne(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('failed');
  expect(result.scoring?.checkpoints?.map((c) => [c.status, c.value])).toEqual([
    ['passed', 1],
    ['passed', 0.8],
    ['failed', 0.8],
  ]);
  expect(result.scoring?.overall).toBeUndefined();
  expect(result.scoring?.passed).toBe(false);
});
