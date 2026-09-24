# Evalkit manual

Evalkit is a kit for authoring agent evals as code. Keep TypeScript eval definitions in Git so your team can review and version them, reuse input fixtures and executable predicate judges across tasks, and run parameter matrices to compare model settings. Each run writes local reports you can inspect, compare, or deliberately archive; results are not automatically committed or shared. An eval combines an **Agent Under Test (AUT)**—the assistant, service, or program being measured—with user messages, optional fixture files, and scoring rules. Evalkit talks to the AUT through an adapter, records what it does, then applies scorers to that evidence. A **run** contains one or more independent **trials**; each trial gets its own workspace and event trajectory.

> **Current scope:** This manual describes the local Bun CLI in this repository. There is no dedicated standalone Evalkit project scaffold or remote Agents SDK transport yet; `bun create` simply copies this repository. Only `user(...)` transcript steps and `predicate(...)` scorers execute today; `agent(...)`/`judge(...)` steps and `judgeScorer(...)` are defined in the API but are not runnable. `policy.timeoutMs` is declared but not enforced. See [Current limitations](#troubleshooting-and-current-limitations).

## Getting started

New to Evalkit? Follow the [getting-started guide](https://evalkit.leostera.dev/docs/) for the first run, starter project, and local dashboard. Come back here for the detailed contracts and examples behind each step.

The CLI uses **the current working directory** as the project root. By default it discovers default-exported `evals/**/*.eval.ts`/`.js` files. An optional `evalkit.config.js`/`.ts`/`.mjs` customizes the project; a `src/registry.ts` is only needed for an explicit registry or suite. It resolves fixture sources relative to this directory and writes `_evalkit-results/` and `_evalkit-sandbox/` here. Run commands from the eval project directory, not the monorepo root. Set `EVALKIT_NO_OPEN=1` to suppress automatic browser opening or `PORT=4318` to choose another dashboard port.

Explore the runnable zero-config [starter](../../../examples/starter/README.md): [`agents/greeting-agent.ts`](../../../examples/starter/agents/greeting-agent.ts), [`evals/greeting.eval.ts`](../../../examples/starter/evals/greeting.eval.ts), and [`judges/greeting.ts`](../../../examples/starter/judges/greeting.ts). For a real `evalkit.config.ts` and lazy parameter sweep, see [configured-matrix](../../../examples/configured-matrix/README.md).

## Project structure and registration

A typical local project looks like this:

```text
my-project/
├── evalkit.config.js           # optional project configuration
├── agents/my-agent.ts          # AUT adapters
├── evals/my-eval.eval.ts       # default-exported eval
├── judges/my-judges.ts         # predicate scorers
└── fixtures/my-case/          # input files
```

There is no dedicated `evalkit init` command yet; `bun create github.com/leostera/evalkit` copies the entire repository. For a new project **inside this monorepo**, use `examples/starter` as a template, give it a `package.json` with workspace dependencies on `@evalkit/core`, `@evalkit/runner`, and `@evalkit/cli` (plus `@evalkit/agents` if using Pi), then run `bun install` at the repository root. These packages are currently private workspace packages, not a published standalone install. For the usual workflow, put a default-exported eval in `evals/*.eval.ts` and run it by `id`: no registry or config file is required. See the [complete eval example](#add-a-scorer-and-an-eval) below.

If you need an explicit suite, group its evals in `src/registry.ts` instead (do not also register its members standalone):

```ts
import { defineSuite, registerEvals } from '@evalkit/core';
import { myEval } from '../evals/my-eval.eval.js';
import { otherEval } from '../evals/other-eval.eval.js';

export default registerEvals([
  defineSuite({
    id: 'my-suite',
    name: 'My suite',
    evals: [myEval, otherEval],
  }),
]);
```

Choose a stable, unique lowercase kebab-case `id` for suites, evals, agents, and matrices. Fixtures have no IDs: their destination and visibility within an eval determine where they materialize. Authored `uri`, `uuid`, and `slug` fields are not supported. IDs are exact-match selectors in the CLI and dashboard; `name` is only a display label. Run and trial IDs/URIs are generated at execution time. See [`packages/core/src/identity.ts`](../../../packages/core/src/identity.ts).

### Configuration and discovery

With no config or registry, the CLI discovers default exports in `evals/**/*.eval.ts` and `*.eval.js` in sorted path order. Each file can export one eval or an array. Add `evalkit.config.js` (also `.ts` or `.mjs`) only to customize discovery, execution, or a matrix. A config takes precedence over `src/registry.ts`; if you need an explicit suite **and** a config, supply its registry as the config's `registry` property. An explicit `evals` list is another alternative to discovery.

```js
import { defineConfig } from '@evalkit/core';

export default defineConfig({
  testDir: 'evals',
  // include: ['**/*.eval.ts'], exclude: ['**/experimental/**'],
  execution: { concurrency: 4, trials: 2, maxCells: 100 },
  reportDir: '_evalkit-results',
  sandboxDir: '_evalkit-sandbox',
});
```

Source paths and output directories resolve relative to the config's directory. `--config path/to/evalkit.config.js` selects a config explicitly. Without a config or registry, the CLI discovers from `evals/` by default. Use `--dry-run` to inspect a plan before launching agents.

## Add an agent

The **Agent Under Test (AUT)** is the system you want to evaluate—not the scorer. It might be your assistant, a local process, or a service. An adapter bridges that system to Evalkit: each trial gets a fresh session, receives the eval's user messages, and emits a trajectory of events. After the session closes, scorers inspect those events and the trial's files.

The adapter implements `start`, returning a session with `send` and `close`. `send` must resolve when that turn is finished; returning an answer from `send` alone does **not** put it in the trajectory. Emit normalized assistant message events for scoring and the dashboard; `content` must be JSON-serializable. For example:

```ts
import { defineAgent } from '@evalkit/core';

export const myAgent = defineAgent({
  identity: {
    name: 'My agent',
    kind: 'local',
    id: 'my-agent',
    version: '1',
  },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context, onEvent }) {
    // context.workspace.root is the candidate-visible directory for this trial.
    // Never pass context.evaluatorWorkspace.root to the model.
    let turn = 0;
    await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
    return {
      async send(message: string) {
        turn++;
        await onEvent({
          kind: 'turn-started',
          turn,
          timestamp: new Date().toISOString(),
        });
        const answer = `Hello, ${message}`; // Replace with your agent call.
        await onEvent({
          kind: 'message',
          role: 'assistant',
          content: answer,
          timestamp: new Date().toISOString(),
        });
        await onEvent({
          kind: 'turn-completed',
          turn,
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
```

`context` also supplies run/eval/trial IDs, zero-based `trialIndex`, `metadata` (including a per-trial `randomSeed`), and optional `parameters` and `runtime`. For an external service, implement the same adapter contract and isolate sessions by trial. The built-in `piAgent()` from `@evalkit/agents` runs the local `pi --print --no-session --no-tools` process once per message in the candidate workspace; see [`examples/starter/agents/pi-agent.ts`](../../../examples/starter/agents/pi-agent.ts). It does not maintain a Pi conversation across messages. The `agentsSdk()` remote adapter currently throws “not implemented yet.”

## Add fixtures

Fixtures materialize **before** the agent starts. Paths in `src` are relative to the CLI working directory; destinations are relative to their respective trial workspace. Each trial has separate `candidate` (visible to the agent) and `evaluator` (private to trusted code/scorers) directories. Explicitly keep answers, secrets, and gold-standard data in the evaluator workspace, not the candidate workspace.

```ts
import { directory, file, inlineFile, dynamic } from '@evalkit/core';

const inputs = [
  // Copies fixtures/my-case/ to candidate/my-case/ by default.
  directory('fixtures/my-case'),
  file(
    'fixtures/answer.txt',
    {
      dst: 'answer.txt',
      visibility: 'evaluator',
    },
  ),
  inlineFile(
    'instructions.txt',
    'Summarize the input.',
    'candidate',
  ),
  dynamic((context) =>
    inlineFile(
      'seed.txt',
      String(context.metadata.randomSeed),
      'candidate',
    ),
  ),
];
```

`directory(src, { dst?, visibility? })` defaults to the source basename and candidate visibility. `file(src, { dst, visibility })` and `inlineFile(path, contents, visibility)` require explicit visibility. `dynamic(create)` can return one fixture or an array (and may be async); use it to generate per-trial inputs. No fixture ID is required; repeating the same destination in different evals is fine. Destinations must be relative, cannot escape the workspace, and cannot duplicate another fixture's destination within the same visibility. Candidate files at the end of a trial are copied into the report; evaluator files are **not** included in that snapshot. Local sandbox directories, however, retain **both** workspaces, so treat them as sensitive.

## Add a scorer and an eval

A predicate receives the full event trajectory plus candidate/evaluator artifact roots. Return a number in `[0, 1]` (only `1` passes by default), or an object with an explicit `passed`, `explanation`, and optional JSON `evidence`:

```ts
// judges/my-judges.ts
import { predicate } from '@evalkit/core';

export const repliesPolitely = predicate(
  'replies politely',
  ({ trajectory }) => {
    const replies = trajectory.events.filter(
      (event) =>
        event.source === 'aut' &&
        event.kind === 'message' &&
        event.role === 'assistant',
    );
    const last = replies.at(-1);
    const passed =
      last?.kind === 'message' &&
      typeof last.content === 'string' &&
      last.content.includes('Hello');
    return {
      value: passed ? 1 : 0,
      passed,
      explanation: 'Expected a greeting.',
    };
  },
);
```

```ts
// evals/my-eval.eval.ts
import { defineEval, user } from '@evalkit/core';
import { myAgent } from '../agents/my-agent.js';
import { repliesPolitely } from '../judges/my-judges.js';

export const myEval = defineEval({
  id: 'polite-greeting',
  name: 'Polite greeting',
  agent: myAgent,
  transcript: [user('Ada')],
  scoring: [repliesPolitely],
  policy: { trials: 3 },
});

export default myEval;
```

Add `fixtures: inputs` if needed. The default export makes the eval discoverable; you only import it into a registry when deliberately defining an explicit suite. Every `user(...)` step calls `session.send(...)` in order on the same session; the runner replaces `{{randomSeed}}` in messages with a newly generated seed per trial. Each trial starts a fresh session and workspace. Scorers run **after** the session closes. Use `artifacts.candidate.root` and `artifacts.evaluator.root` inside a scorer to read files (for example with `node:fs/promises`); `trajectory.events` contains `source: 'aut'` and `source: 'runner'` events. If execution fails, normal scorers are skipped; `predicate(name, fn, { supportsPartial: true })` can score the partial trajectory when a context/workspace exists. A scorer exception is recorded as a failed scorer, not as a successful score.

## Run from the CLI

Run these from the project directory (`examples/starter` for the included example):

```sh
bun run evalkit run-evals                        # all discovered evals (or an explicit registry)
bun run evalkit run-evals greeting               # select an eval ID
bun run evalkit run-evals greeting --json
bun run evalkit run-evals greeting --concurrency 4
bun run evalkit serve-dashboard
```

If you defined an explicit suite in a registry, run it with `bun run evalkit run-suite my-suite`; the zero-config starter does not define suites. For a matrix, use the [configured example](../../../examples/configured-matrix/README.md) below.

`--json` emits one JSON object per completed matrix cell, including its key, eval ID, parameters, and run result. `--concurrency <positive integer>` bounds parallel cells (default 4). Be mindful of API rate limits and provider costs.

The CLI also accepts `--model`, `--max-tokens`, `--chat-timeout-ms`, and `--turn-budget`; these become `context.parameters` for adapters that implement them. **The built-in `piAgent()` does not consume these parameters.** Its `args` option is set when constructing `piAgent({ args: [...] })`. Use `--trials <positive integer>` to override `policy.trials` for a run.

Optional matrices lazily expand a Cartesian product of parameter axes. With default-exported `evals/*.eval.ts` files, configure one in `evalkit.config.js` (or see the runnable [configured-matrix](../../../examples/configured-matrix/README.md) project):

```js
import { defineConfig } from '@evalkit/core';

export default defineConfig({
  matrix: {
    id: 'models',
    parameters: { model: ['model-a', 'model-b'] },
  },
  execution: { concurrency: 4, maxCells: 100 },
});
```

Run with `bun run evalkit run-matrix models --eval polite-greeting`; `--eval <evalId,...>` filters by ID. Use `--dry-run` to inspect the cell count before dispatch and `--all` to permit more than `maxCells`. Each cell invokes its eval with its parameter values; adapters must read `context.parameters` to use them. Cell keys and parameters are persisted in manifests. You can also register an explicit `defineEvalMatrix({ id, evals, parameters })` in `src/registry.ts`; a matrix does not implicitly register its evals for `run-evals`.

## Read and process results

The CLI writes v2 manifests with human `evalId`/`suiteId`/matrix IDs and generated run/trial URIs. Older v1 manifests with authored resource URIs are not migrated or listed by the v2 dashboard; their files remain on disk. The CLI writes the following tree under the current project directory:

```text
_evalkit-results/<run-uuid>/
├── manifest.json                # eval/suite/agent identity, start time
├── summary.json                 # run status, trialCount, passed, failed
└── trials/<trial-uuid>/
    ├── manifest.json            # trialIndex (zero-based), identity
    ├── trajectory.jsonl         # one timestamped event per line
    ├── scoring.json             # scorer results, overall, passed
    ├── summary.json             # execution status, scoring, error, artifacts
    └── artifacts/candidate/...  # candidate workspace snapshot, if files exist
```

`_evalkit-sandbox/<trial-uuid>/{candidate,evaluator}/` preserves the actual local workspaces for debugging. Both directories are ignored by Git in this repository's example and can be deleted when no longer needed; apply equivalent ignore/retention rules in your own project. Avoid sharing raw reports or sandboxes before checking for sensitive data in messages and candidate files.

Open the dashboard to navigate suites/evals, start runs, inspect trials and event timelines, see scorer values and candidate files. For automation, read the report files directly (requires `jq`):

```sh
# Replace with an actual run UUID from _evalkit-results/.
RUN="_evalkit-results/<run-uuid>"
jq '{status, trialCount, passed, failed}' "$RUN/summary.json"
jq '{status, scoring, error}' "$RUN"/trials/*/summary.json
jq -r '.results[] | [.name, (.value // "error"), .passed] | @tsv' "$RUN"/trials/*/scoring.json
jq -s 'map(select(.source == "aut" and .kind == "message"))' "$RUN"/trials/*/trajectory.jsonl
```

`scoring.overall` is the **unweighted mean of valid scorer values**, not a pass percentage; it may be absent if no valid score exists. A trial passes only when execution completed **and** all scorers passed without errors. `summary.json` at run level counts passed/failed trials; compare those counts across repeated runs rather than treating `status: "completed"` alone as a pass. The CLI returns a nonzero exit code when any matrix cell fails; use run-level `failed` in `summary.json` for detailed CI gates (for example, `jq -e '.failed == 0 and .trialCount > 0' "$RUN/summary.json"`). A scorer returning zero can leave execution `status: "completed"` while run summary reports a failed trial. Adapters may include usage and latency in `turn-completed` trajectory events; read `trajectory.jsonl` for those details.

## Troubleshooting and current limitations

- **Unknown eval:** Run from the project directory and select the eval by its ID. Default-export it from a matching `evals/*.eval.ts` file; check `testDir`/`include`/`exclude` if you have a config. If using an explicit suite, confirm its registry is loaded. Check for duplicate or malformed IDs.
- **Fixture not found / duplicate destination:** Fixture `src` is relative to the working directory, not the eval file. Give each fixture a unique destination per workspace; do not use absolute paths or `..` as destinations.
- **Pi exited / command not found:** Install/configure Pi, or run only the self-contained greeting eval. The Pi adapter requires the local `pi` command; the Agents SDK remote adapter is not implemented.
- **No response in a score:** The adapter must emit an assistant `message` event; merely returning a value from `send` does not put it in the trajectory.
- **Execution vs scoring:** A completed execution can fail its scoring rules. Inspect trial `scoring.json`, `summary.json`, and `trajectory.jsonl`, not just the CLI's status line.
- **Not yet executable:** Non-user transcript steps, judge scorers, timeout enforcement, remote Agents SDK transport, and automatic standalone project scaffolding are not available. CLI model/budget flags only forward parameters to adapters, not enforce them.

For deeper API contracts, see [`packages/core/src/index.ts`](../../../packages/core/src/index.ts), [`packages/runner/src/index.ts`](../../../packages/runner/src/index.ts), and the starter example.
