---
title: Scorers and evals
description: Compose executable evals, write predicates, and interpret scoring and failures.
---

An eval joins an [AUT adapter](/docs/manual/agents/), an ordered `transcript`, optional [fixtures](/docs/manual/fixtures/), a list of `scoring` rules, and optional `policy` and `metadata`. Give it a stable kebab-case `id`; `name` is a display label. For ordinary projects, default-export it from a matching `evals/*.eval.ts` or `.js` file so the CLI discovers it.

## Write a reusable predicate

`predicate(name, callback)` is the post-session scorer. The callback receives `{ context, trajectory, artifacts }`: the same per-trial context given to the adapter, a read-only array of AUT and runner events, and candidate/evaluator workspace roots. It can be async, read files, and use the effective matrix parameters.

```ts
// judges/greeting.ts
import { predicate } from '@evalkit/core';

export const greetingIsReturned = predicate(
  'returns a greeting',
  ({ trajectory }) => {
    const reply = trajectory.events.find(
      (event) =>
        event.source === 'aut' &&
        event.kind === 'message' &&
        event.role === 'assistant',
    );
    const passed = reply?.kind === 'message' && reply.content === 'Hello, Ada';
    return {
      value: passed ? 1 : 0,
      passed,
      explanation: 'Expected the greeting for Ada.',
    };
  },
);
```

Filter by `source` and `kind`: runner-generated step and scorer events also appear in the trajectory. An adapter must emit its actual assistant response; `send()` returning a string does not record one. To score files, read `artifacts.candidate.root` or `artifacts.evaluator.root` with `node:fs/promises`. Check the [fixture visibility rules](/docs/manual/fixtures/) before using private reference files. The full [starter judge](https://github.com/leostera/evalkit/blob/main/examples/starter/judges/greeting.ts) is a runnable example.

## Define and discover the eval

```ts
// evals/greeting.eval.ts
import { defineEval, user } from '@evalkit/core';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export const greetingEval = defineEval({
  id: 'greeting',
  name: 'Starter greeting',
  agent: greetingAgent,
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
  policy: { trials: 3 },
});

export default greetingEval;
```

For each trial, Evalkit creates a workspace and new session, interprets the authored transcript in order, then closes the session **before** running final scorers. `user(...)` sends a message; `check(...)` and `expectToolCall(...)` inspect the just-completed turn before the next user message. `{{randomSeed}}` in a user message is replaced by that trial's numeric seed. `metadata` on the eval is included in the trial context, along with the seed. `policy.trials` requests independent trials (default one); `--trials` and config `execution.trials` can override it. `policy.timeoutMs` exists in the type but **does not enforce a deadline**. If you import the eval into an explicit suite, register it through that suite only; otherwise its default export is enough for discovery.

### Intermediate checkpoints

Use `check(name, callback)` between user steps for deterministic assertions against the live workspace or the just-completed turn. It receives `{ context, trajectory, artifacts, turn }`; `turn.lastAssistantText`, `turn.assistantMessages`, `turn.toolCalls`, and `turn.events` describe **AUT observations**, not the return value of `send()`. Multiple checks after one user step inspect the same turn. A check before the first user step is invalid.

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { check, defineEval, expectToolCall, user } from '@evalkit/core';

async function candidateText(root: string) {
  try {
    return await readFile(join(root, 'number.txt'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

const evaluation = defineEval({
  id: 'write-then-revise',
  agent: myAgent, // your AUT adapter
  transcript: [
    user('Write 2112 into number.txt.'),
    expectToolCall({
      name: 'write_file',
      arguments: { path: 'number.txt', contents: '2112' },
    }),
    check(
      'first version',
      async ({ artifacts }) =>
        (await candidateText(artifacts.candidate.root)) === '2112',
    ),
    user('Change number.txt to 2113.'),
    check(
      'revised version',
      async ({ artifacts }) =>
        (await candidateText(artifacts.candidate.root)) === '2113',
    ),
  ],
  scoring: [],
  policy: { failfast: true },
});
```

The runnable [interleaved scenario project](https://github.com/leostera/evalkit/tree/main/examples/interleaved-scenario) contains two default-exported evals, a local AUT that emits tool events, and a report integration test. From `examples/interleaved-scenario`, run `bun run pass` for the completed revision or `bun run failfast` for an **intentional nonzero exit** when the first file check fails.

For a missing file to count as a **failed assertion** rather than an execution error, catch only `ENOENT` inside the callback and return `false`; let unexpected I/O errors propagate. `expectToolCall` matches an emitted AUT `tool-call` in the current turn, by exact name and (when supplied) exact JSON arguments; it neither invokes the tool nor proves that the file was written. An adapter must emit tool events for this assertion to pass.

A check can return `true`/`false`, a numeric score in `[0, 1]`, or a score object as below. A failed assertion persists as a checkpoint failure and keeps the trial from passing even if later checks pass. With `policy.failfast: true`, the runner skips remaining authored steps, closes the session, and attempts final scoring and reporting; without it, later steps run. A thrown/invalid check is an execution error and stops regardless of `failfast`. After failfast, only final predicates declared with `{ supportsPartial: true }` run. `scoring.overall` still averages **final** predicate values, never checkpoints. See [Results and reports](/docs/manual/results/) for checkpoint status and the v3 report format. Checkpoints do not enforce `policy.timeoutMs` or process-wide egress/cancellation guards.

### Score return values

A predicate returns either a number in `[0, 1]` or `{ value, passed?, explanation?, evidence? }`. Values must be finite and within that interval. Without an explicit `passed`, **only a value of exactly `1` passes**; a score of `0.9` does not. Set `passed` yourself to encode a threshold:

```ts
import { predicate } from '@evalkit/core';

export const greetingRate = predicate('greeting rate', ({ trajectory }) => {
  const replies = trajectory.events.filter(
    (event) =>
      event.source === 'aut' &&
      event.kind === 'message' &&
      event.role === 'assistant',
  );
  const greeted = replies.filter(
    (event) =>
      event.kind === 'message' &&
      typeof event.content === 'string' &&
      event.content.startsWith('Hello'),
  ).length;
  const value = replies.length ? greeted / replies.length : 0;
  return { value, passed: value >= 0.8, explanation: 'At least 80% greet.' };
});
```

`explanation` is human-readable; `evidence` must be JSON-serializable. Scorers execute **in definition order** after session close. A thrown error or an invalid score is saved as a scorer error with `passed: false` and no numeric value; another scorer can still run. The trial's `scoring.overall` is the unweighted mean of **valid numeric** scorer values and is omitted when there are none. `scoring.passed` requires all scorers to pass and no scorer errors; it is not inferred from `overall`. An empty scorer list produces no overall value and is vacuously `passed: true`—add a real predicate if you want a meaningful gate.

### Partial execution and errors

If fixture setup or the adapter fails, execution status becomes `failed`. By default, scorers are skipped after a primary execution error. `predicate(name, fn, { supportsPartial: true })` can inspect a partial trajectory **if the trial context and workspace were created**; this does not make the failed execution pass. A session close error is also recorded. A scoring failure, on the other hand, can leave execution `status: "completed"` with `scoring.passed: false`. Use run-level pass/fail counts or the CLI exit status for a CI gate rather than execution status alone; see [Results and reports](/docs/manual/results/#understanding-status-and-scores).

`agent(...)` and `judge(...)` transcript steps and `judgeScorer(...)` are declared in the API but **not executable yet**. Trying one of those transcript steps fails execution; a judge scorer records a scorer error. Do not depend on them for grading. The executable transcript steps are `user(...)`, `check(...)`, and `expectToolCall(...)`; the executable final scorer is `predicate(...)`.
