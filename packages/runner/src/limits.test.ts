import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import {
  defineAgent,
  defineEval,
  defineEvalMatrix,
  predicate,
  user,
  type RunResult,
  type Transcript,
} from '@evalkit/core';
import {
  localReportStore,
  readRunEvents,
  readRunManifest,
  readRunSubagents,
  readRunTranscript,
  runEval,
  runMatrix,
} from './index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const dir of roots.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'evalkit-limits-'));
  roots.push(dir);
  return dir;
}
const runOne = async (
  effect: ReturnType<typeof runEval>,
): Promise<RunResult> => {
  const [run, ...more] = await Effect.runPromise(effect);
  if (!run || more.length) throw new Error('expected exactly one run');
  return run;
};

/** An agent that keeps calling a tool until EvalKit stops it, as a looping agent would. */
function loopingAgent(usage = { input: 100, output: 10 }) {
  let sawAbort = false;
  const agent = defineAgent({
    async start({ context, transcript }) {
      return {
        async send() {
          for (let step = 0; !context.signal.aborted; step++) {
            transcript.assistant({
              content: [
                {
                  type: 'tool_call',
                  id: `c${step}`,
                  name: 'ls',
                  arguments: {},
                },
              ],
              usage,
            });
            transcript.toolResult(`c${step}`, 'a.txt');
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
          sawAbort = true;
        },
      };
    },
  });
  return {
    agent,
    get sawAbort() {
      return sawAbort;
    },
  };
}

const scenario = (agent: ReturnType<typeof loopingAgent>['agent']) =>
  defineEval({
    id: 'looping',
    agent,
    transcript: [user('list the files'), user('never sent')],
    scoring: [
      predicate('partial', () => 1, { supportsPartial: true }),
      predicate('whole', () => 1),
    ],
  });

test('a run past its step limit is stopped and limited, scored only by partial scorers', async () => {
  const dir = await root();
  const looping = loopingAgent();
  const result = await runOne(
    runEval(defineEval({ ...scenario(looping.agent), limits: { steps: 3 } }), {
      report: localReportStore(dir),
    }),
  );
  expect(result.status).toBe('limited');
  expect(result.limit).toEqual({ limit: 'steps', value: 3, used: 4 });
  expect(result.error).toBeUndefined();
  // The agent saw context.signal abort and stopped on its own.
  expect(looping.sawAbort).toBe(true);
  // As for errored runs, only scorers that support partial runs grade it.
  expect(result.scoring?.results.map((r) => r.name)).toEqual(['partial']);
  expect(result.scoring?.skippedScorers).toEqual(['whole']);
  expect(result.scoring?.passed).toBe(false);
  const manifest = await readRunManifest(dir, result.runId);
  expect(manifest).toMatchObject({ status: 'limited', limits: { steps: 3 } });
  const events = await readRunEvents(dir, result.runId);
  const reached = events.find((event) => event.kind === 'limit-reached');
  expect(reached).toMatchObject({ limit: 'steps', value: 3, used: 4 });
  expect(events.some((event) => event.kind === 'error')).toBe(false);
  // The second prompt is never sent.
  const transcript = await readRunTranscript(dir, result.runId);
  const users = transcript.records.filter(
    (record) => record.type === 'message' && record.role === 'user',
  );
  expect(users).toHaveLength(1);
});

test("a limited run's graders still run commands in its sandbox", async () => {
  const dir = await root();
  const looping = loopingAgent();
  const outputs: string[] = [];
  const result = await runOne(
    runEval(
      defineEval({
        ...scenario(looping.agent),
        limits: { steps: 3 },
        scoring: [
          predicate(
            'builds',
            async ({ context }) => {
              // A server the grader starts, as for checking a built service.
              const server = context.shell.spawn('echo up; sleep 5');
              const exec = await context.shell.exec('echo graded');
              outputs.push(exec.stdout.trim());
              // Still running: the reached limit did not stop it.
              const settled = await Promise.race([
                server.wait().then(() => 'exited'),
                new Promise((resolve) => setTimeout(resolve, 200, 'running')),
              ]);
              outputs.push(String(settled));
              await server.kill();
              return exec.exitCode === 0 ? 1 : 0;
            },
            { supportsPartial: true },
          ),
        ],
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(result.status).toBe('limited');
  expect(result.scoring?.results).toMatchObject([{ name: 'builds', value: 1 }]);
  expect(outputs).toEqual(['graded', 'running']);
});

test('the token limit counts uncached tokens; cache reads do not count', async () => {
  const dir = await root();
  // 110 uncached tokens a step (cache reads excluded): the fourth step passes 400.
  const looping = loopingAgent({
    input: 100,
    output: 10,
    cacheRead: 10_000,
  } as never);
  const result = await runOne(
    runEval(scenario(looping.agent), {
      report: localReportStore(dir),
      limits: { override: { tokens: 400 } },
    }),
  );
  expect(result.status).toBe('limited');
  expect(result.limit).toEqual({ limit: 'tokens', value: 400, used: 440 });
});

test('the time limit stops a run that takes too long', async () => {
  const dir = await root();
  const result = await runOne(
    runEval(scenario(loopingAgent().agent), {
      report: localReportStore(dir),
      limits: { base: { time: 50 } },
    }),
  );
  expect(result.status).toBe('limited');
  expect(result.limit).toMatchObject({ limit: 'time', value: 50 });
  expect(result.limit!.used).toBeGreaterThanOrEqual(50);
});

test('later limits override earlier ones kind by kind: project, scenario, then cell and --limit', async () => {
  const dir = await root();
  const result = await runOne(
    runEval(
      defineEval({ ...scenario(loopingAgent().agent), limits: { steps: 100 } }),
      {
        report: localReportStore(dir),
        limits: { base: { steps: 1, time: 60_000 }, override: { steps: 2 } },
      },
    ),
  );
  expect(result.limit).toEqual({ limit: 'steps', value: 2, used: 3 });
  expect((await readRunManifest(dir, result.runId)).limits).toEqual({
    steps: 2,
    time: 60_000,
  });
});

test('a scenario with an invalid limit is refused when defined', () => {
  expect(() =>
    defineEval({
      id: 'bad',
      agent: loopingAgent().agent,
      transcript: [user('go')],
      scoring: [],
      limits: { steps: 0 },
    }),
  ).toThrow('steps');
});

test('a matrix compares limits as axes named limits.<kind>', async () => {
  const dir = await root();
  const matrix = defineEvalMatrix({
    id: 'step-budgets',
    evals: [scenario(loopingAgent().agent)],
    parameters: {},
    limits: { steps: [2, 5] },
  });
  const seen: Array<[unknown, RunResult['limit']]> = [];
  const summary = await Effect.runPromise(
    runMatrix(matrix, {
      report: localReportStore(dir),
      selection: { parameters: { 'limits.steps': [5] } },
      onResult: (cell, runs) => {
        for (const run of runs) seen.push([cell.parameters, run.limit]);
      },
    }),
  );
  expect(summary).toMatchObject({ runs: 1, limited: 1, failed: 0 });
  expect(seen).toEqual([
    [{ 'limits.steps': 5 }, { limit: 'steps', value: 5, used: 6 }],
  ]);
  expect(() =>
    defineEvalMatrix({
      id: 'bad',
      evals: [],
      parameters: {},
      limits: { steps: [0] },
    }),
  ).toThrow('steps');
});

test('a turn still running at the limit gets a grace to finish; what it writes is kept', async () => {
  const dir = await root();
  const agent = defineAgent({
    async start({ context, transcript }) {
      return {
        async send() {
          transcript.assistant({ content: 'one' });
          transcript.assistant({ content: 'two' });
          // Over the limit now: finish writing, then return.
          await new Promise((resolve) => setTimeout(resolve, 20));
          transcript.assistant({
            content: context.signal.aborted ? 'wrapping up' : 'unaware',
          });
        },
      };
    },
  });
  const result = await runOne(
    runEval(
      defineEval({
        id: 'grace',
        agent,
        transcript: [user('go')],
        scoring: [],
        limits: { steps: 1 },
      }),
      { report: localReportStore(dir) },
    ),
  );
  expect(result.status).toBe('limited');
  const transcript = await readRunTranscript(dir, result.runId);
  expect(
    transcript.records.flatMap((record) =>
      record.type === 'message' && record.role === 'assistant'
        ? record.content.flatMap((block) =>
            block.type === 'text' ? [block.text] : [],
          )
        : [],
    ),
  ).toEqual(['one', 'two', 'wrapping up']);
});

test("a sub-agent's steps count toward the run's limits, and its transcript is kept with the run", async () => {
  const dir = await root();
  const child = (steps: number): Transcript => ({
    header: {
      type: 'transcript' as const,
      atxf: '0.1',
      id: 'worker-1',
      time: '2026-01-01T00:00:00.000Z',
      source: { agent: 'worker' },
    },
    records: Array.from({ length: steps }, (_, index) => ({
      type: 'message' as const,
      id: `w${index + 1}`,
      parentId: index ? `w${index}` : null,
      time: '2026-01-01T00:00:01.000Z',
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: `step ${index + 1}` }],
    })),
  });
  const agent = defineAgent({
    async start({ transcript }) {
      return {
        async send() {
          transcript.append({
            type: 'agent_link',
            relation: 'spawn',
            transcriptId: 'worker-1',
            agent: { name: 'worker' },
          });
          transcript.subagent(child(2));
          // Given again as it grows: only the new step counts.
          transcript.subagent(child(3));
          transcript.assistant({ content: 'the worker is done' });
        },
      };
    },
  });
  const result = await runOne(
    runEval(
      defineEval({
        id: 'delegates',
        agent,
        transcript: [user('go')],
        scoring: [],
      }),
      { report: localReportStore(dir), limits: { override: { steps: 3 } } },
    ),
  );
  expect(result.status).toBe('limited');
  expect(result.limit).toEqual({ limit: 'steps', value: 3, used: 4 });
  const subagents = await readRunSubagents(dir, result.runId);
  expect(Object.keys(subagents)).toEqual(['worker-1']);
  expect(subagents['worker-1']!.records.map((record) => record.type)).toEqual([
    'message',
    'message',
    'message',
    'seal',
  ]);
});
