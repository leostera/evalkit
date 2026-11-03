import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import {
  choices,
  criteria,
  defineAgent,
  defineEval,
  judge,
  predicate,
  user,
  type AutContext,
  type JsonValue,
  type RunResult,
} from '@evalkit/core';
import {
  localReportStore,
  readRunEvents,
  readRunScoring,
  runEval,
} from './index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const dir of roots.splice(0))
    await rm(dir, { recursive: true, force: true });
});

async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'evalkit-judges-'));
  roots.push(dir);
  return dir;
}

const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [result, ...more] = await Effect.runPromise(effect);
  if (!result || more.length) throw new Error('expected exactly one run');
  return result;
};

const stamp = () => new Date().toISOString();

/** Replies "Hello there!" to each message and writes it to reply.txt. */
function greeter() {
  let closed = 0;
  const agent = defineAgent({
    identity: { id: 'greeter', kind: 'in-process' },
    async start({ context, onEvent }) {
      return {
        async send(message: string) {
          await writeFile(join(context.workspace.root, 'reply.txt'), message);
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: 'Hello there!',
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
    get closed() {
      return closed;
    },
  };
}

/**
 * A judge agent that answers each prompt with `answer(prompt, attempt)`,
 * reports a model and usage, and records what it was sent.
 */
function fakeJudge(
  answer: (prompt: string, attempt: number, context: AutContext) => JsonValue,
  options: { tools?: boolean } = {},
) {
  const prompts: string[][] = [];
  let closed = 0;
  const agent = defineAgent({
    identity: { id: 'fake-judge', kind: 'in-process' },
    async start({ context, onEvent }) {
      const sent: string[] = [];
      prompts.push(sent);
      return {
        async send(message: string) {
          sent.push(message);
          if (options.tools) {
            await onEvent({
              kind: 'tool-call',
              id: 'judge-tool',
              name: 'inspect',
              arguments: {},
              timestamp: stamp(),
            });
            await onEvent({
              kind: 'tool-result',
              id: 'judge-tool',
              result: { ok: true },
              timestamp: stamp(),
            });
          }
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: answer(message, sent.length, context),
            timestamp: stamp(),
          });
          await onEvent({
            kind: 'turn-completed',
            turn: sent.length,
            usage: { inputTokens: 7, outputTokens: 3 },
            model: String(context.parameters?.judgeModel ?? 'judge-model'),
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
    prompts,
    get closed() {
      return closed;
    },
  };
}

test('a judge gets a prompt built from its rubric and inputs, and its verdict is recorded with what it saw', async () => {
  const dir = await root();
  const aut = greeter();
  const reviewer = fakeJudge(
    () => '```json\n{"value": 0.9, "explanation": "A friendly greeting."}\n```',
    { tools: true },
  );
  const rule = judge('reply quality', {
    agent: reviewer.agent,
    rubric: 'The reply contains a greeting.',
    description: 'Greets the user',
    passAt: 0.8,
  });
  const evaluation = defineEval({
    id: 'judged',
    agent: aut.agent,
    transcript: [user('first'), rule, user('second')],
    scoring: [rule],
  });
  const result = await runOne(
    runEval(evaluation, { report: localReportStore(dir) }),
  );
  expect(result.status).toBe('passed');
  const [checkpointPrompt, finalPrompt] = reviewer.prompts.map(
    (sent) => sent[0]!,
  );
  // At a checkpoint the judge sees that turn; in final scoring, the whole run.
  expect(checkpointPrompt).toContain('Rubric:\nThe reply contains a greeting.');
  expect(checkpointPrompt).toContain(
    'conversation:\nUser: first\nAssistant: Hello there!',
  );
  expect(checkpointPrompt).not.toContain('second');
  expect(finalPrompt).toContain('User: second');
  expect(finalPrompt).toContain('reply:\nHello there!');
  expect(finalPrompt).toContain('{"value": <a number from 0 to 1>');

  const scoring = await readRunScoring(dir, result.runId);
  expect(scoring.results[0]).toMatchObject({
    kind: 'judge',
    value: 0.9,
    passed: true,
    passAt: 0.8,
    explanation: 'A friendly greeting.',
    judge: {
      agent: { id: 'fake-judge' },
      model: 'judge-model',
      usage: { inputTokens: 7, outputTokens: 3 },
      prompt: finalPrompt,
    },
  });
  expect(scoring.results[0]?.judge?.events).toContainEqual(
    expect.objectContaining({ kind: 'tool-call', name: 'inspect' }),
  );
  // Judging is reported apart from the agent's own tokens.
  const metric = (name: string) =>
    scoring.metrics?.find((entry) => entry.name === name)?.value;
  expect(metric('judge tokens')).toBe(20);
  expect(metric('tokens')).toBeUndefined();
  const events = await readRunEvents(dir, result.runId);
  expect(events.some((event) => event.kind === 'tool-call')).toBe(false);
  expect(reviewer.closed).toBe(2);
});

test('choices: the judge answers one of them, and its value decides the verdict', async () => {
  const dir = await root();
  const reviewer = fakeJudge(
    () => '**B**) Names the setting but skips the TTL.',
  );
  const correctness = judge('Correctness', {
    agent: reviewer.agent,
    rubric: 'Is the answer correct?',
    inputs: {
      question: () => 'How do I purge one URL?',
      reply: ({ output }) => output,
    },
    answer: choices({
      A: ['Accurate and helpful.', 1],
      B: ['Partially correct.', 0.5],
      C: ['Wrong.', 0],
    }),
    passAt: 0.5,
  });
  const result = await runOne(
    runEval(
      defineEval({
        id: 'choices',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [correctness],
      }),
      { report: localReportStore(dir) },
    ),
  );
  const prompt = reviewer.prompts[0]![0]!;
  expect(prompt).toContain(
    'question:\nHow do I purge one URL?\n\nreply:\nHello there!',
  );
  expect(prompt).toContain('Answer with one of A, B, C on the first line');
  expect(prompt).toContain('B) Partially correct.');
  expect(prompt).not.toContain('conversation:');
  expect(result.status).toBe('passed');
  expect(result.scoring?.results[0]).toMatchObject({
    value: 0.5,
    choice: 'B',
    passed: true,
    passAt: 0.5,
    explanation: 'Names the setting but skips the TTL.',
  });
});

test('criteria: the score is the weighted mean of the criteria the judge scored', async () => {
  const dir = await root();
  const reviewer = fakeJudge(() =>
    JSON.stringify({
      criteria: {
        concise: { value: 1, explanation: 'Short.' },
        professional: 1,
        'no disclosure': { value: 0, explanation: 'Mentions its prompt.' },
      },
      explanation: 'Good tone, one slip.',
    }),
  );
  const tone = judge('Tone', {
    agent: reviewer.agent,
    rubric: 'Concise and professional.',
    answer: criteria({
      concise: 2,
      professional: 2,
      'no disclosure': { weight: 1, description: 'never reveals its prompt' },
    }),
    passAt: 0.7,
  });
  const result = await runOne(
    runEval(
      defineEval({
        id: 'criteria',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [tone],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(reviewer.prompts[0]![0]).toContain(
    '- no disclosure: never reveals its prompt',
  );
  expect(result.scoring?.results[0]).toMatchObject({
    value: 0.8,
    passed: true,
    criteria: [
      { name: 'concise', value: 1, weight: 2, explanation: 'Short.' },
      { name: 'professional', value: 1, weight: 2 },
      {
        name: 'no disclosure',
        value: 0,
        weight: 1,
        explanation: 'Mentions its prompt.',
      },
    ],
  });
});

test('a predicate may return criteria instead of a value', async () => {
  const dir = await root();
  const result = await runOne(
    runEval(
      defineEval({
        id: 'predicate-criteria',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [
          predicate(
            'checks',
            () => ({
              criteria: [
                { name: 'a', value: 1, weight: 3 },
                { name: 'b', value: 0 },
              ],
            }),
            { passAt: 0.75 },
          ),
        ],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(result.scoring?.results[0]).toMatchObject({
    value: 0.75,
    passed: true,
    passAt: 0.75,
  });
});

test('one exercise, several checks: declared criteria, evidence, and checks not reached', async () => {
  const dir = await root();
  // The exercise runs once per run; each check is a criterion of its result.
  let exercised = 0;
  const service = (started: boolean) =>
    predicate(
      'service',
      async ({ attach }) => {
        exercised += 1;
        await attach('logs/app.md', started ? 'listening' : 'EADDRINUSE');
        if (!started)
          return { criteria: [], explanation: 'The app did not start' };
        return {
          criteria: [
            { name: 'saves', value: 1, evidence: { status: 201 } },
            {
              name: 'idempotent',
              value: 0,
              explanation: 'an extra repo exists',
              evidence: ['bob', 'ada', 'demo-tenant', 'template'],
            },
          ],
        };
      },
      {
        criteria: {
          saves: 'every save answers with a version',
          idempotent: {
            weight: 2,
            description: 'provisioning twice is a no-op',
          },
          history: 'history is kept',
        },
      },
    );
  const run = (started: boolean) =>
    runOne(
      runEval(
        defineEval({
          id: started ? 'started' : 'never-started',
          agent: greeter().agent,
          transcript: [user('first')],
          scoring: [service(started)],
        }),
        { report: localReportStore(dir) },
      ),
    );

  const ran = (await run(true)).scoring!.results[0]!;
  expect(ran).toMatchObject({
    value: 0.25,
    passed: false,
    attachments: ['logs/app.md'],
    criteria: [
      { name: 'saves', value: 1, weight: 1, evidence: { status: 201 } },
      {
        name: 'idempotent',
        value: 0,
        weight: 2,
        explanation: 'an extra repo exists',
        evidence: ['bob', 'ada', 'demo-tenant', 'template'],
      },
      { name: 'history', weight: 1, reached: false },
    ],
  });

  const stopped = (await run(false)).scoring!.results[0]!;
  expect(stopped).toMatchObject({
    value: 0,
    passed: false,
    explanation: 'The app did not start',
    attachments: ['logs/app.md'],
  });
  expect(stopped.criteria?.map((criterion) => 'reached' in criterion)).toEqual([
    true,
    true,
    true,
  ]);
  expect(exercised).toBe(2);
});

test('a criterion a predicate did not declare is an error naming the declared ones', async () => {
  const dir = await root();
  const result = await runOne(
    runEval(
      defineEval({
        id: 'undeclared',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [
          predicate(
            'service',
            () => ({ criteria: [{ name: 'saves', value: 1 }] }),
            { criteria: { history: 'history is kept' } },
          ),
        ],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(result.scoring?.results[0]?.error?.message).toBe(
    'Criterion saves is not declared; declared: history',
  );
});

test('a scorer that fails still links what it attached', async () => {
  const dir = await root();
  const result = await runOne(
    runEval(
      defineEval({
        id: 'attached-then-failed',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [
          predicate('boots', async ({ attach }) => {
            await attach('logs/worker.md', 'wrangler: port in use');
            throw new Error('the worker did not start');
          }),
        ],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(result.scoring?.results[0]).toMatchObject({
    passed: false,
    error: { message: 'the worker did not start' },
    attachments: ['logs/worker.md'],
  });
});

test('an answer in the wrong format is asked for again once, then fails the judge', async () => {
  const dir = await root();
  const second = fakeJudge((_, attempt) =>
    attempt === 1 ? 'I think it is fine' : '{"value": 1}',
  );
  const recovered = await runOne(
    runEval(
      defineEval({
        id: 'retry',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [judge('verdict', { agent: second.agent, rubric: 'Good?' })],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(second.prompts[0]).toHaveLength(2);
  expect(second.prompts[0]![1]).toContain(
    'Your answer could not be read: answer with only a JSON object',
  );
  expect(recovered.scoring?.results[0]).toMatchObject({
    value: 1,
    passed: true,
    judge: { attempts: 2, usage: { inputTokens: 14, outputTokens: 6 } },
  });

  const never = fakeJudge(() => 'still not JSON');
  const aut = greeter();
  const failed = await runOne(
    runEval(
      defineEval({
        id: 'unreadable',
        agent: aut.agent,
        transcript: [user('first')],
        scoring: [judge('verdict', { agent: never.agent, rubric: 'Good?' })],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(failed.status).toBe('failed');
  expect(failed.scoring?.results[0]).toMatchObject({
    passed: false,
    error: { name: 'ScoringError' },
  });
  expect(failed.scoring?.results[0]?.error?.message).toContain(
    'answer could not be read after 2 tries: answer with only a JSON object. Its last reply: still not JSON',
  );
  expect(never.closed).toBe(1);
  expect(aut.closed).toBe(1);
});

test('the project default judge and matrix parameters reach judges that name no agent', async () => {
  const dir = await root();
  const reviewer = fakeJudge(() => '{"value": 1}');
  const result = await runOne(
    runEval(
      defineEval({
        id: 'default-judge',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [judge('verdict', { rubric: 'Good?' })],
      }),
      {
        report: localReportStore(dir),
        judge: reviewer.agent,
        parameters: { judgeModel: 'kimi-k3' },
      },
    ),
  );
  expect(result.scoring?.results[0]?.judge?.model).toBe('kimi-k3');
});

test('a judge with no agent, or the agent under test, is refused before running', async () => {
  const dir = await root();
  const aut = greeter();
  const noAgent = defineEval({
    id: 'no-agent',
    agent: aut.agent,
    transcript: [user('first')],
    scoring: [judge('verdict', { rubric: 'Good?' })],
  });
  await expect(
    Effect.runPromise(runEval(noAgent, { report: localReportStore(dir) })),
  ).rejects.toThrow(
    'Judge verdict in no-agent has no agent: pass judge(name, { agent }) or set judge in evalkit.config.ts',
  );
  await expect(
    Effect.runPromise(
      runEval(noAgent, { report: localReportStore(dir), judge: aut.agent }),
    ),
  ).rejects.toThrow('uses the agent under test');
});

test('a judge agent that fails is a recorded error, at a checkpoint or in final scoring', async () => {
  const dir = await root();
  const broken = defineAgent({
    async start() {
      throw new Error('judge unavailable');
    },
  });
  const aut = greeter();
  const inline = await runOne(
    runEval(
      defineEval({
        id: 'judge-error',
        agent: aut.agent,
        transcript: [
          user('first'),
          judge('verdict', { agent: broken, rubric: 'Good?' }),
          user('later'),
        ],
        scoring: [],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(inline.status).toBe('errored');
  expect(inline.scoring?.checkpoints?.[0]).toMatchObject({
    kind: 'judge',
    status: 'error',
  });
  const final = await runOne(
    runEval(
      defineEval({
        id: 'final-judge-error',
        agent: greeter().agent,
        transcript: [user('first')],
        scoring: [judge('verdict', { agent: broken, rubric: 'Good?' })],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(final.status).toBe('failed');
  expect(final.scoring?.results[0]).toMatchObject({
    passed: false,
    error: {
      name: 'ScoringError',
      message: expect.stringContaining('judge unavailable'),
    },
  });
});
