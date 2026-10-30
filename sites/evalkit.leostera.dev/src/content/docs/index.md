---
title: Get started
description: Run a local agent eval, then learn how to author and score your own.
---

Write an agent task in TypeScript, run it locally, then inspect the messages, scores, and files it produced. This guide starts with an agent that needs no model credentials. For the full API, see the [manual](/docs/manual/).

## First run

You need [Bun](https://bun.sh/) 1.4.2, or Node 22.18 or later (the CLI prefers Bun when both are installed). Create a project from npm; no model key is needed:

```sh
bunx @leostera/evalkit new ./agent-evals
cd agent-evals
bun install
bun run check
bun run evalkit run
```

`bun run evalkit run` runs the generated `greeting` scenario in two styles and ends with a summary. To see which cells will run first, use `bun run evalkit run --matrix styles --dry-run`. To browse results, start `bun run evalkit dev`; `bun run evalkit build` writes a read-only snapshot you can host and share. Reports are saved under `_evalkit-results/` in the project you just created.

The scaffold includes `scenarios/`, `agents/`, `datasets/`, `judges/`, `evalkit.config.ts`, and `tsconfig.json`. Run commands **from the eval project directory** so discovery, datasets, and reports resolve there. See [CLI and matrices](/docs/manual/cli-and-matrices/) for selection and safety limits.

### Already have a Bun project?

Run these commands from its root:

```sh
bun add @leostera/evalkit
bun run evalkit new .
bun install
```

The scaffold preserves existing scripts, dependencies, and README; it stops before changing anything if a generated path already exists. See [project setup](/docs/manual/project-structure/) for the full contract.

## Define a scenario

A scenario is one concrete conversation with the Agent Under Test (AUT), scored in a specific way. It composes an agent, user messages, optional datasets, and scoring rules, each defined once in its own directory and imported. Give it a stable lowercase kebab-case `id`.

```ts
// scenarios/greeting.eval.ts
import { defineEval, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greeting } from '../datasets/greeting.dataset.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  datasets: [greeting],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});
```

Default-export a scenario from a file in `scenarios/` and run it with `bun run evalkit run greeting`. The CLI discovers `scenarios/**/*.eval.ts` and `.js` files automatically: no registry is required. Each directory directly below `scenarios/` is a suite, so `scenarios/billing/refunds.eval.ts` is in suite `billing`. Keep each scenario small and write a hundred of them rather than one that loops; share the agents, datasets and judges.

Learn more: [Project structure and discovery](/docs/manual/project-structure/) · [Scorers and evals](/docs/manual/scoring-and-evals/).

## Connect an agent

The **Agent Under Test (AUT)** is the assistant, service, or program being measured—not the judge that grades it. An adapter connects that system to EvalKit. For each trial, EvalKit starts a fresh session, sends the user messages, and records events the adapter emits. Scorers inspect that trajectory and the resulting files.

An adapter implements `start()`, returning a session with `send(message)`. `send()` resolves when the turn finishes and may return the reply; EvalKit records it. Return `{ reply, toolCalls, usage }` to record tool calls and token usage too, or call `onEvent` to stream events as they happen.

```ts
// agents/greeting-agent.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@leostera/evalkit';

export const greetingAgent = defineAgent({
  identity: { id: 'greeting-agent', kind: 'in-process' },
  async start({ context }) {
    return {
      async send(message: string) {
        const file = join(context.workspace.root, 'greeting', 'greeting.txt');
        const greeting = `${(await readFile(file, 'utf8')).trim()}, ${message}!`;
        return context.parameters?.style === 'shout'
          ? greeting.toUpperCase()
          : greeting;
      },
    };
  },
});
```

Use `context.workspace.root` for candidate-visible files and `context.data` for candidate dataset values. Never pass `context.evaluatorWorkspace.root` to a model. For a local Pi process, `piAgent()` is available from `@leostera/evalkit`, but it invokes Pi independently for each message.

Learn more: [Agents under test](/docs/manual/agents/).

## Add datasets

A dataset is named data a scenario uses: files copied into each trial's workspace, a value given to the agent and scorers, or both. Define it once in `datasets/` and import it from every scenario that needs it.

```ts
// datasets/greeting.dataset.ts
import { defineDataset } from '@leostera/evalkit';

export const greeting = defineDataset({
  id: 'greeting',
  files: 'datasets/greeting', // copied to greeting/ in each trial's workspace
});
```

Candidate datasets (the default) are visible to the agent; `visibility: 'evaluator'` keeps expected answers for the scorers only. Inputs that are expensive to build can be computed with `onLoad`, called once per process and cached, and varied per trial with `onRun`.

Learn more: [Datasets](/docs/manual/datasets/).

## Score a trial

A reusable `predicate(...)` is an executable judge. It runs after the session closes, with the final reply as `output`, the dataset values as `data`, and the full trajectory and files. A numeric score passes only at `1` unless you give `passAt`; return `skip(reason)` when a check does not apply.

```ts
// judges/matches-greeting.ts
import { predicate } from '@leostera/evalkit';

export const matchesGreeting = predicate(
  'matches greeting and style',
  ({ context, output }) => {
    const expected =
      context.parameters?.style === 'shout' ? 'HELLO, ADA!' : 'Hello, Ada!';
    return {
      value: output === expected ? 1 : 0,
      explanation: `Expected ${expected}`,
    };
  },
);
```

Score errors are saved, not silently counted as passes.

Learn more: [Scorers and evals](/docs/manual/scoring-and-evals/).

## Read results

Keep scenario definitions in Git. Results are **local files**, not automatically committed or shared. Each run lives in `_evalkit-results/<run-id>/`; read its `summary.json` for passed and failed trial counts. Under `trials/<trial-id>/`, inspect `trajectory.jsonl`, `scoring.json`, `summary.json`, and candidate artifacts.

```sh
RUN="_evalkit-results/<run-id>"
jq '{trialCount, passed, failed}' "$RUN/summary.json"
jq -r '.results[] | [.name, .value, .passed] | @tsv' "$RUN"/trials/*/scoring.json
```

> **Important:** Execution status `completed` does not mean the scores passed. `evalkit run` exits non-zero when a scenario fails; in CI, add `--junit <file>` for a test report and `evalkit compare` to gate on regressions against the base branch. Local `_evalkit-sandbox/` directories retain _both_ candidate and evaluator workspaces; review them for sensitive data before sharing.

Learn more: [Results and reports](/docs/manual/results/).

## Configure a project

The generated project already includes `evalkit.config.ts` with a runnable matrix. Edit it to change discovery, execution limits, or parameter axes:

```ts
// evalkit.config.ts
import { defineConfig } from '@leostera/evalkit';

export default defineConfig({
  matrix: { id: 'styles', parameters: { style: ['plain', 'shout'] } },
  execution: { concurrency: 2, maxCells: 20 },
});
```

Paths resolve relative to the config file. You can customize `include`, `exclude`, and `testDir`. An explicit registry supports optional suites. For a runnable provider-free config and parameter sweep, see [`examples/configured-matrix`](https://github.com/leostera/evalkit/tree/main/examples/configured-matrix).

Learn more: [Project structure and discovery](/docs/manual/project-structure/).

## Sweep parameters

A matrix lazily expands evals × parameter axes into independent cells. The generated agent reads `context.parameters.style`; `--select` narrows the `style` axis, and `--dry-run` shows the count before starting anything. Plans above `execution.maxCells` require `--all`.

```sh
bun run evalkit run --matrix styles --dry-run
bun run evalkit run --matrix styles
bun run evalkit run --matrix styles --eval greeting --select style=shout
```

A selected parameter only affects the AUT when its adapter reads and applies it. The built-in `piAgent()` does not automatically switch models based on a `model` parameter. Cell keys and effective parameters are saved with the reports.

Learn more: [CLI and matrices](/docs/manual/cli-and-matrices/).

## What's next

Use the sidebar to explore the [manual](/docs/manual/) for suites, dataset visibility, scorer contracts, CLI selection, and report processing. The generated project is a runnable reference for project layout and matrix configuration; the [zero-config starter](https://github.com/leostera/evalkit/tree/main/examples/starter) and [interleaved scenario](https://github.com/leostera/evalkit/tree/main/examples/interleaved-scenario) show additional eval patterns.

Today `user(...)`, deterministic `predicate(...)`, agent-backed `judge(...)` (with a separate eval-level `judge` agent), and observed `expectToolCall(...)` transcript steps execute. Predicates and judges also run in final `scoring`. Remote Agents SDK transport and enforced timeouts are not available. Install the public npm package to get started; see [project setup](/docs/manual/project-structure/).
