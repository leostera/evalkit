---
title: Scorers and evals
description: Compose executable evals, write predicates, and interpret scoring and failures.
---

An eval joins an [AUT adapter](/docs/manual/agents/), an ordered `transcript`, optional [fixtures](/docs/manual/fixtures/), a list of `scoring` rules, and optional `policy` and `metadata`. Give it a stable kebab-case `id`; `name` is a display label. For ordinary projects, default-export it from a matching `evals/*.eval.ts` or `.js` file so the CLI discovers it.

## Write a reusable predicate

`predicate(name, callback)` is a deterministic scoring rule that works both between turns and after the session closes. The same `judge(name, { rubric })` descriptor works in either position when the eval supplies a separate `judge` agent. The callback receives `{ context, trajectory, artifacts, turn? }`: the same per-trial context given to the adapter, a read-only array of AUT and runner events, candidate/evaluator workspace roots, and the most recent completed turn if available. It can be async, read files, and use the effective matrix parameters.

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

For each trial, EvalKit creates a workspace and new session, interprets the authored transcript in order, then closes the session **before** running final scorers. `user(...)` sends a message; inline `predicate(...)`, `judge(...)`, and `expectToolCall(...)` evaluate after the just-completed turn and before the next user message. `{{randomSeed}}` in a user message is replaced by that trial's numeric seed. `metadata` on the eval is included in the trial context, along with the seed. `policy.trials` requests independent trials (default one); `--trials` and config `execution.trials` can override it. `policy.timeoutMs` exists in the type but **does not enforce a deadline**. If you import the eval into an explicit suite, register it through that suite only; otherwise its default export is enough for discovery.

### Intermediate checkpoints

Use `predicate(name, callback)` between user steps for deterministic assertions against the live workspace or the just-completed turn. It receives `{ context, trajectory, artifacts, turn? }`; `turn` is always present at an inline checkpoint, but is optional in the shared callback type because final scoring can run without a user turn. Its `lastAssistantText`, `assistantMessages`, `toolCalls`, and `events` describe **AUT observations**, not the return value of `send()`. In final scoring, `turn` refers to the last completed user turn (if any), while `trajectory` contains the whole trial. Multiple inline rules after one user step inspect the same turn. An inline rule before the first user step is invalid.

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineEval, expectToolCall, predicate, user } from '@evalkit/core';

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
    predicate(
      'first version',
      async ({ artifacts }) =>
        (await candidateText(artifacts.candidate.root)) === '2112',
    ),
    user('Change number.txt to 2113.'),
    predicate(
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

A predicate can return `true`/`false`, a numeric score in `[0, 1]`, or a score object as below in **either** position. A failed inline assertion persists as a checkpoint failure and keeps the trial from passing even if later rules pass. With `policy.failfast: true`, the runner skips remaining authored steps, closes the session, and attempts final scoring and reporting; without it, later steps run. A throwing/invalid inline rule is an execution error and stops regardless of `failfast`. After failfast, only final rules declared with `{ supportsPartial: true }` run. `scoring.overall` still averages **final** predicate and judge values, never checkpoints. See [Results and reports](/docs/manual/results/) for checkpoint status and the v3 report format. Checkpoints do not enforce `policy.timeoutMs` or process-wide egress/cancellation guards.

### Judge agents

`judge(name, { rubric, supportsPartial? })` declares a rule. Supply a **separate agent** in the eval's `judge` field to execute it. Passing the same adapter object as `agent` and `judge` is rejected. The same judge descriptor can be placed in `transcript` and `scoring`:

```ts
import { defineEval, judge, user } from '@evalkit/core';
import { piAgent } from '@evalkit/agents';

const clarity = judge('clarity', { rubric: 'Is the reply clear and accurate?' });

export default defineEval({
  id: 'judge-clarity',
  agent: myAgent,     // the system being measured
  judge: piAgent(),  // separate, tool-free local judge agent; requires Pi/model access
  transcript: [user('Explain the change.'), clarity],
  scoring: [clarity],
  policy: { failfast: true },
});
```

For each assessment, EvalKit starts a **fresh judge session**, sends a JSON prompt with the rubric plus either the just-completed AUT turn (`transcript`) or the accumulated trajectory (`scoring`), then closes the judge session. The judge must emit a structured verdict as `completed.output` or an assistant `message` containing JSON, for example `{ "value": 0.9, "passed": true, "explanation": "..." }`. Missing, malformed, or out-of-range verdicts are errors—not passing scores. `piAgent()` invokes a no-tools Pi process; other judge adapters may use their own tools. Judge tools run in the **evaluator** workspace, not the candidate workspace, and judge events are saved inside the judge score rather than attributed to AUT events.

The runner records the judge agent's identity, emitted events, and token usage **when the adapter emits it**. Cost is not measured automatically. Judge prompts and events can contain sensitive data; a custom judge adapter controls its model, tools, and external disclosure. A failed inline verdict participates in `failfast`; a judge execution error is a checkpoint error inline or a scorer error after close. EvalKit does not enforce judge timeouts or cancel a hung call. The [provider-free fake judge example](https://github.com/leostera/evalkit/blob/main/examples/interleaved-scenario/evals/judged-reply.eval.ts) runs both placements without model credentials.

### Score return values

A predicate returns a boolean, a number in `[0, 1]`, or `{ value, passed?, explanation?, evidence? }`. Values must be finite and within that interval. Without an explicit `passed`, **only a value of exactly `1` passes**; a score of `0.9` does not. Set `passed` yourself to encode a threshold:

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

`explanation` is human-readable; `evidence` must be JSON-serializable. Final rules execute **in definition order** after session close. A thrown error or an invalid score is saved as a scorer error with `passed: false` and no numeric value; another scorer can still run. The trial's `scoring.overall` is the unweighted mean of **valid numeric** scorer values and is omitted when there are none. `scoring.passed` requires all scorers to pass and no scorer errors; it is not inferred from `overall`. An empty scorer list produces no overall value and is vacuously `passed: true`—add a real predicate if you want a meaningful gate.

### Partial execution and errors

If fixture setup or the adapter fails, execution status becomes `failed`. By default, scorers are skipped after a primary execution error. `predicate(name, fn, { supportsPartial: true })` can inspect a partial trajectory **if the trial context and workspace were created**; this does not make the failed execution pass. A session close error is also recorded. A scoring failure, on the other hand, can leave execution `status: "completed"` with `scoring.passed: false`. Use run-level pass/fail counts or the CLI exit status for a CI gate rather than execution status alone; see [Results and reports](/docs/manual/results/#understanding-status-and-scores).

`agent(...)` is still declared but **not executable**; inserting it into a transcript fails execution. The executable transcript steps are `user(...)`, `predicate(...)`, `judge(...)`, and `expectToolCall(...)`. Both `predicate(...)` and `judge(...)` also work in final `scoring`. A judge rule without an eval-level `judge` agent is rejected at definition time rather than silently passing.
