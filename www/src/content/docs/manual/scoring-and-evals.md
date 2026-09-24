---
title: Scorers and evals
description: Compose executable evals, write predicates, and interpret scoring and failures.
---

An eval joins an [AUT adapter](/docs/manual/agents/), an ordered `transcript`, optional [fixtures](/docs/manual/fixtures/), a list of `scoring` rules, and optional `policy` and `metadata`. Give it a stable kebab-case `id`; `name` is a display label. For ordinary projects, default-export it from a matching `evals/*.eval.ts` or `.js` file so the CLI discovers it.

## Write a reusable predicate

`predicate(name, callback)` is the currently executable scorer. The callback receives `{ context, trajectory, artifacts }`: the same per-trial context given to the adapter, a read-only array of AUT and runner events, and candidate/evaluator workspace roots. It can be async, read files, and use the effective matrix parameters.

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

For each trial, Evalkit creates a workspace and new session, sends each `user(...)` message sequentially on that session, then closes it **before** running scorers. `{{randomSeed}}` in a user message is replaced by that trial's numeric seed. `metadata` on the eval is included in the trial context, along with the seed. `policy.trials` requests independent trials (default one); `--trials` and config `execution.trials` can override it. `policy.timeoutMs` exists in the type but **does not enforce a deadline**. If you import the eval into an explicit suite, register it through that suite only; otherwise its default export is enough for discovery.

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

`agent(...)` and `judge(...)` transcript steps and `judgeScorer(...)` are declared in the API but **not executable yet**. Trying a non-user step fails execution; a judge scorer records a scorer error. Do not depend on them for grading. Only `user(...)` and `predicate(...)` run today.
