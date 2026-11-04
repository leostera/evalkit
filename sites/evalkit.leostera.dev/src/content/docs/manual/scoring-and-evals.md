---
title: Scorers and evals
description: Compose executable evals, write predicates, and interpret scoring and failures.
---

A scenario (`defineEval`) joins an [AUT adapter](/docs/manual/agents/), an ordered `transcript`, optional [datasets](/docs/manual/datasets/), a list of `scoring` rules, and optional `policy` and `metadata`. Give it a stable kebab-case `id`; `name` is a display label. Default-export it from a `scenarios/**/*.eval.ts` or `.js` file so the CLI discovers it.

## Write a reusable predicate

`predicate(name, callback)` is a deterministic scoring rule that works both between turns and after the session closes. The same `judge(name, { rubric })` descriptor works in either position; a separate [judge agent](#judges) grades it. The callback receives `{ context, output, data, transcript, subagents, runEvents, artifacts, turn? }`: the same per-run context given to the adapter, the content of the last assistant message, the values of all the scenario's datasets by ID, the agent's [transcript](/docs/manual/agents/#the-transcript) and those of its sub-agents, EvalKit's own events (steps, checkpoints, scorers), candidate/evaluator workspace roots, and the most recent completed turn if available. It can be async, read files, and use the effective matrix parameters.

```ts
// judges/greeting.ts
import { predicate } from '@leostera/evalkit';

export const greetingIsReturned = predicate(
  'returns a greeting',
  ({ output }) => ({
    value: output === 'Hello, Ada' ? 1 : 0,
    explanation: 'Expected the greeting for Ada.',
  }),
);
```

Use `output` for the final reply and `data` for expected answers kept in an [evaluator dataset](/docs/manual/datasets/#who-sees-what). For what the agent did, read the transcript with the helpers:

```ts
import {
  lastReply,
  messages,
  predicate,
  toolCalls,
  usage,
} from '@leostera/evalkit';

export const readTheDocs = predicate('read the docs before answering', (ctx) =>
  toolCalls(ctx, 'read_file').some((call) =>
    String(call.arguments.path).startsWith('docs/'),
  ),
);
```

`messages(ctx, role?)` gives each message's `role` and `text`; `toolCalls(ctx, name?)` each call's `name`, `arguments` and `result`; `lastReply(ctx)` the last reply's text; `usage(ctx)` the summed usage; `modelContext(ctx)` what the model saw at the end, compactions applied. For anything else, `transcript` is the full [ATXF](https://atxf.leostera.dev) transcript. To score files, read `artifacts.candidate.root` or `artifacts.evaluator.root` with `node:fs/promises`. The full [starter judge](https://github.com/leostera/evalkit/blob/main/examples/starter/judges/greeting.ts) is a runnable example.

## Define and discover the scenario

```ts
// scenarios/greeting.eval.ts
import { defineEval, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export const greetingEval = defineEval({
  id: 'greeting',
  name: 'Starter greeting',
  agent: greetingAgent,
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
  repeat: 3,
});

export default greetingEval;
```

For each run, EvalKit creates a workspace and new session, interprets the authored transcript in order, then closes the session **before** running final scorers. `user(...)` sends a message; inline `predicate(...)`, `judge(...)`, and `expectToolCall(...)` evaluate after the just-completed turn and before the next user message.

A user message can be computed for each run from what the agent is also given: pass `user()` a function of `{ parameters, data, seed, batch }`. `parameters` is the matrix cell's values, `data` the scenario's candidate datasets (never evaluator ones) and `seed` the run's random seed. This keeps one scenario for every cell of a matrix, with the prompt varying only where it should:

```ts
// evalkit.config.ts: matrix: { id: 'toolchains', parameters: { toolchain: ['opam', 'dune', 'riot'] } }
user(
  ({ parameters }) =>
    `Set up OCaml with ${parameters.toolchain} and create a hello world application.`,
);
```

The transcript records the message each run was actually sent; the scenario page shows that the message is computed. `metadata` on the eval is included in the run context, along with the seed. `repeat` starts that many independent runs each time the scenario runs (default one), as one batch; `--repeat` and config `execution.repeat` override it. Each run is complete on its own, with its own sandbox, seed, transcript and scores, and the dashboard, scoreboard, Compare and JUnit count runs. `limits` caps a run's steps, tokens and time; see [Limits](/docs/manual/agents/#limits). If you import the eval into an explicit suite, register it through that suite only; otherwise its default export is enough for discovery.

### Intermediate checkpoints

Use `predicate(name, callback)` between user steps for deterministic assertions against the live workspace or the just-completed turn. It receives `{ context, output, data, transcript, artifacts, checkpoints, turn? }`; `turn` is always present at an inline checkpoint, but is optional in the shared callback type because final scoring can run without a user turn. Its `lastAssistantText`, `assistantMessages`, `toolCalls`, and `records` describe the turn as recorded, including a reply or tool calls returned from `send()`. In final scoring, `turn` refers to the last completed user turn (if any), while `transcript` holds the whole run, and at a checkpoint everything up to it. Multiple inline rules after one user step inspect the same turn. An inline rule before the first user step is invalid.

Final scoring runs after the session closes, so a checkpoint is the place to inspect live state (a container, a server) and put what it saw in `evidence` for final scorers to read, instead of sharing it through module-level variables. Look its result up with `checkpoint(rule)`, passing the checkpoint itself rather than its name, so renaming it cannot break the lookup, and its `evidence` keeps the type the predicate returned:

```ts
// exec() stands for your own helper that runs a command in the workspace.
const builds = predicate('hello builds', async ({ context }) => {
  const run = await exec(context.workspace.root, 'dune exec ./hello.exe');
  return {
    value: run.exitCode === 0 ? 1 : 0,
    evidence: { stdout: run.stdout },
  };
});

export default defineEval({
  // ...
  transcript: [user('Write hello world in OCaml.'), builds],
  scoring: [
    predicate(
      'prints hello',
      ({ checkpoint }) =>
        // evidence is { stdout: string } | undefined
        checkpoint(builds)?.evidence?.stdout.includes('Hello') ?? false,
    ),
  ],
});
```

`checkpoint(rule)` returns the latest result of that step (`status`, `value`, `explanation`, `evidence`, ...), or `undefined` if it has not run yet. A rule that is not in the transcript throws, so a stale reference fails loudly. Evidence is saved as JSON, so it arrives in its JSON form (a `Date` becomes a string). `checkpoints` also lists every result so far, in order, for scorers that look at all of them.

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineEval, expectToolCall, predicate, user } from '@leostera/evalkit';

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

The runnable [interleaved scenario project](https://github.com/leostera/evalkit/tree/main/examples/interleaved-scenario) contains two default-exported evals, a local AUT that records tool calls, and a report integration test. From `examples/interleaved-scenario`, run `bun run evalkit run write-revise` for the completed revision or `bun run evalkit run failfast-file` for an **intentional nonzero exit** when the first file check fails.

For a missing file to count as a **failed assertion** rather than an execution error, catch only `ENOENT` inside the callback and return `false`; let unexpected I/O errors propagate. `expectToolCall` matches a tool call the agent recorded in the current turn, by exact name and (when supplied) exact JSON arguments; it neither invokes the tool nor proves that the file was written. An adapter must record its tool calls for this assertion to pass.

A predicate can return `true`/`false`, a numeric score in `[0, 1]`, or a score object as below in **either** position. A failed inline assertion persists as a checkpoint failure and keeps the run from passing even if later rules pass. With `policy.failfast: true`, the runner skips remaining authored steps, closes the session, and attempts final scoring and reporting; without it, later steps run. A throwing/invalid inline rule is an execution error and stops regardless of `failfast`. After failfast, only final rules declared with `{ supportsPartial: true }` run. `scoring.overall` still averages **final** predicate and judge values, never checkpoints. See [Results and reports](/docs/manual/results/) for checkpoint status and the report format. Checkpoints run within the run's `time` limit; they do not add egress guards.

### Judges

`judge(name, { rubric })` is a scorer graded by a model. You write the rubric and say what the judge sees and how it answers; EvalKit builds the prompt, sends it to a **judge agent**, reads the answer, and asks once more if it cannot. How the agent calls its model is up to the agent: it is an ordinary [`defineAgent()`](/docs/manual/agents/) agent, never the one being measured.

```ts
// judges/correctness.ts
import { choices, judge, messages } from '@leostera/evalkit';

export const correctness = judge('correctness', {
  description: 'Is the answer factually correct and useful?',
  rubric:
    "Is the assistant's response factually correct and useful for what the user asked?",
  inputs: {
    question: (ctx) => messages(ctx, 'user')[0]?.text ?? null,
    expected: ({ data }) => data.expectations?.answer ?? null,
    reply: ({ output }) => output ?? null,
  },
  answer: choices({
    A: ['Accurate and helpful.', 1],
    B: ['Partially correct or missing key detail.', 0.5],
    C: ['Wrong, misleading or unhelpful.', 0],
  }),
  passAt: 0.5,
});
```

| Option        | Meaning                                                                                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rubric`      | What to judge, in the judge's words.                                                                                                                                                                                                                                                                     |
| `description` | What it checks, in yours: shown in the dashboard, `--dry-run` and the Judges page.                                                                                                                                                                                                                       |
| `inputs`      | What the judge sees: `{ name: (ctx) => value }`, each given the [scoring context](/docs/reference/api/#scoring). Default: `conversation` (the turn at a checkpoint, the whole run in final scoring) and `reply`. Only these reach the judge; evaluator datasets stay hidden unless an input passes them. |
| `answer`      | `choices({ A: [label, value], ... })`: one letter, worth its value. `criteria({ name: weight })`: a value per criterion, scored as their weighted mean. Default: a value from 0 to 1 and why.                                                                                                            |
| `passAt`      | The lowest value that passes. Default: only 1. `choices` and `criteria` usually want lower.                                                                                                                                                                                                              |
| `agent`       | The judge agent. Default: `judge` in `evalkit.config.ts`.                                                                                                                                                                                                                                                |

Most projects set one judge agent for all their judges, and give a rule its own `agent` only when it needs a different one:

```ts
// evalkit.config.ts
import { defineConfig } from '@leostera/evalkit';
import { judgeAgent } from './agents/judge.js';

export default defineConfig({ judge: judgeAgent });
```

The judge agent gets the prompt as its message, and replies as any agent does; it should report `usage` and the `model` it used. Like the agent under test, it receives the matrix cell's `context.parameters`, so **a matrix can choose the judge's model** separately from the agent's, for example a cheaper agent judged by a stronger model:

```ts
// agents/judge.ts
export const judgeAgent = defineAgent({
  identity: { id: 'judge', kind: 'in-process' },
  async start({ context }) {
    const model = String(context.parameters?.judgeModel ?? 'large-model');
    return {
      async send(prompt) {
        const { text, usage } = await callYourModel(model, prompt);
        return { reply: text, usage, model };
      },
    };
  },
});

// evalkit.config.ts
export default defineConfig({
  judge: judgeAgent,
  matrix: {
    id: 'models',
    parameters: {
      model: ['small-model', 'large-model'],
      judgeModel: ['large-model'],
    },
  },
});
```

Each judge result saves the prompt it saw, its reply, its conversation, its usage, the model it reported, and the pass mark applied. The run page shows them when you open a verdict, and a **Judging** section totals what judging cost, apart from the agent's own tokens. The built-in `judge tokens` metric is that total, so the scoreboard can compare it. A reply EvalKit still cannot read after asking twice is a scorer error, never a pass. Every judge session is new, runs in the evaluator workspace, and keeps its own ATXF transcript inside its result. Judges do not count toward the agent's limits. The [judges example](https://github.com/leostera/evalkit/tree/main/examples/judges) runs choices, criteria and predicate judges without model credentials.

### Score return values

A predicate returns a boolean, a number in `[0, 1]`, `{ value, passed?, explanation?, evidence?, criteria? }`, or `skip(reason)`. Without a `value`, the score is the weighted mean of `criteria` (weight 1 by default), and the run page shows the formula; see [one exercise, several checks](#one-exercise-several-checks). Values must be finite and within that interval. Without an explicit `passed`, **only a value of exactly `1` passes**; a score of `0.9` does not. Give `passAt` to pass numeric scores at a threshold; an explicit `passed` in a returned object still wins:

```ts
import { predicate, skip } from '@leostera/evalkit';

export const citesSources = predicate(
  'cites its sources',
  ({ output, data }) => {
    const expected = (data.answers as { sources?: string[] }).sources;
    if (!expected?.length) return skip('this question has no sources');
    const text = String(output ?? '');
    const cited = expected.filter((source) => text.includes(source)).length;
    return { value: cited / expected.length, evidence: { cited } };
  },
  { passAt: 0.8 },
);
```

A skipped result is recorded with its reason and no value. It neither passes nor fails the run and is left out of averages; a run whose scorers all skip passes.

`explanation` is human-readable. `evidence` may be any plain value; it is converted to JSON once, and a value that cannot be (a function, `bigint`, a cycle) fails the scorer with the path of the bad field. Final rules execute **in definition order** after session close. A thrown error or an invalid score is saved as a scorer error with `passed: false` and no numeric value; another scorer can still run. The run's `scoring.overall` is the unweighted mean of **valid numeric** scorer values and is omitted when there are none. `scoring.passed` requires all scorers to pass and no scorer errors; it is not inferred from `overall`. An empty scorer list produces no overall value and is vacuously `passed: true`—add a real predicate if you want a meaningful gate.

### One exercise, several checks

Some checks share an expensive exercise: start the app the agent built, drive it, read back what it stored. Write them as **one** predicate that runs the exercise once and returns a criterion per check. Declare the checks up front, so the scenario page, the Judges page and `--dry-run` list them before any run:

```ts
import { predicate } from '@leostera/evalkit';

export const notesService = predicate(
  'notes service',
  async ({ artifacts, attach }) => {
    const app = await startApp(artifacts.candidate.root).catch(
      (error) => error,
    );
    if (app instanceof Error)
      // Every declared check left out is recorded as not reached.
      return {
        criteria: [],
        explanation: `The app did not start: ${app.message}`,
      };
    try {
      const saved = await app.saveTwice('a');
      const history = await app.history('a');
      return {
        criteria: [
          {
            name: 'saves',
            value: saved.every((s) => s.version) ? 1 : 0,
            evidence: saved,
          },
          {
            name: 'history',
            value: history.length === 2 ? 1 : 0,
            explanation: `${history.length} entries, expected 2`,
            evidence: history,
          },
        ],
      };
    } finally {
      await attach('logs/app.md', app.log());
      await app.stop();
    }
  },
  {
    description: 'Saves and history of the notes service the agent built',
    criteria: {
      saves: 'every save answers with a version',
      history: 'history lists each save, newest first',
    },
  },
);
```

Each criterion is `{ name, value, weight?, explanation?, evidence? }`, or `{ name, reached: false }` for a check that never ran because something before it failed. A declared check the result leaves out is recorded as not reached, and one it did not declare is an error, so the checks listed before a run are the checks recorded after it. A check not reached counts as 0. The run page shows it as **not reached**, the CLI as `not reached saves, history` with the root cause once, never as a row of `0.0`s. Each criterion's evidence opens under it, and the files the predicate attached are linked from its verdict. With the default `passAt` of 1, every check must pass; give weights and a lower `passAt` to allow some to fail.

### Graders that read external state

A grader that checks what the agent's program did (repositories it created, rows it wrote, tokens it issued) shares that state with the agent's own testing. Leftovers from the agent's tries can make a check pass that should fail, or fail one that should pass: an extra repository makes "creates exactly one" fail, and an ID the agent already used makes "rejects duplicates" pass for the wrong reason. Two patterns avoid it:

- **Reset before you exercise.** Clear or recreate the state the check reads, then drive the program from a known start. Best when the state is cheap to rebuild.
- **Compare before and after.** Record what exists, drive the program, and judge only the difference: "one more repository, named after the tenant", not "two repositories". Best when the state cannot be reset.

Put what you saw before and after in the criterion's `evidence`, so a surprising verdict explains itself.

Such a grader cannot be re-run on a saved run: the state it reads lived while the run did. After you fix a bug in one, run the affected scenarios again; the new runs are scored by the fixed grader, and the old ones keep the verdicts they had. A judge that reads only saved inputs, such as the agent's code, is a good second opinion here: when it passes work your checks fail, suspect the check.

### Metrics

Scores decide pass or fail; **metrics** measure. A metric is a number recorded for every run, such as tokens, retries, mistakes or web searches, and it never affects whether the run passes. List them in `metrics`:

```ts
import { defineEval, metric, toolCalls, user } from '@leostera/evalkit';

const webSearches = metric(
  'web searches',
  (ctx) => toolCalls(ctx, 'web_search').length,
  { better: 'lower' },
);

export default defineEval({
  id: 'zero-to-ocaml',
  agent,
  transcript: [user('Set up OCaml and create a hello world application.')],
  scoring: [helloWorld],
  metrics: [webSearches],
});
```

A metric receives the same context as a final scorer and runs after the scorers. Return `undefined` when there is nothing to measure; a thrown error is recorded on that metric and the others still run. `unit` labels the value (`ms` formats as a duration) and `better: 'lower' | 'higher'` says which direction is an improvement.

EvalKit also records **built-in metrics** for every run. Their names are the type `BuiltInMetricName`, and reusing one for a scenario metric is a type error and a definition error. Sub-agents' transcripts count toward all but `judge tokens`.

| Name             | Unit   | What it counts                                                                                                                       |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `agent time`     | ms     | From the run's first record or event to its last one before final scoring: the agent's turns and the checkpoints between them.       |
| `tokens`         | tokens | Uncached input, cache writes and output, summed over the transcript. Cache reads are left out, so a cached prompt does not dominate. |
| `cached tokens`  | tokens | Input tokens read from a prompt cache.                                                                                               |
| `output tokens`  | tokens | Generated tokens, reasoning included.                                                                                                |
| `cache hit rate` | —      | The share of input tokens read from a cache, from 0 to 1.                                                                            |
| `steps`          | —      | Assistant messages, one per model call. A tool call and the reply after it are two steps.                                            |
| `tool calls`     | —      | Tool calls in the transcript.                                                                                                        |
| `judge tokens`   | tokens | The tokens the run's judges used, counted as `tokens` is. Kept apart from the agent's tokens. Not recorded when no judge did.        |

The token metrics are not recorded when nothing reported usage, so they are never a misleading zero. Tokens are only what the adapter reports; EvalKit does not count them itself. See [reporting usage](/docs/manual/agents/#reporting-token-usage).

Each run's metrics are saved in `scoring.json` and shown on its page, and the scoreboard has a column per metric with its mean over the last 10 runs, coloured from green to red when `better` is set.

A metric a run did not record, because it predates the metric, its agent reported no usage, or the metric returned `undefined`, is **not measured**, never zero. It is left out of every mean, and the dashboard says how many contributed: "not measured" on a run page, "1 of 2 runs" on the scoreboard and in Compare cells, and "not measured" when none did. A scenario's **Compare** table can show any metric by matrix parameter.

### Partial execution and errors

If dataset setup or the adapter fails, the run is `errored`. By default, scorers are skipped after a primary execution error. `predicate(name, fn, { supportsPartial: true })` can inspect a partial transcript **if the run context and workspace were created**; this does not make the failed execution pass. A session close error is also recorded. A run that reaches a [limit](/docs/manual/agents/#limits) ends `limited`: only scorers with `supportsPartial` grade it, and it counts as a failure. A scoring failure, on the other hand, makes the run `failed`, with `scoring.passed: false`. For a CI gate, use the CLI exit status or count the runs that passed; see [Results and reports](/docs/manual/results/#understanding-status-and-scores).

`agent(...)` is still declared but **not executable**; inserting it into a transcript fails execution. The executable transcript steps are `user(...)`, `predicate(...)`, `judge(...)`, and `expectToolCall(...)`. Both `predicate(...)` and `judge(...)` also work in final `scoring`. A judge rule with no `agent` and no project `judge` is rejected before the run starts rather than silently passing.
