---
title: Get started
description: Run a local agent eval, then learn how to author and score your own.
---

An eval tells Evalkit what task to give your agent, which agent to run, and how to score what happened. Write it as TypeScript, keep definitions in Git, and inspect each run as local files. This guide follows the current Bun implementation; the [manual](/docs/manual/) covers the full contracts.

## First run

`bun create` copies the repository and installs its workspace dependencies. Start with the self-contained greeting eval: it needs neither Pi nor a model provider.

```sh
bun create github.com/leostera/evalkit
cd evalkit/examples/starter
bun run evalkit run-evals greeting
bun run evalkit serve-dashboard
```

Run the dashboard command in a second terminal if you want to keep using the first one. **Run commands from your eval project directory**: Evalkit discovers eval files, resolves fixtures, and writes reports there. The starter works without a config or registry.

> **Note:** `bun run evals` runs _all_ discovered starter evals, including Pi-backed ones. Those require a working `pi` command and configured model access.

Learn more: [CLI and matrices](/docs/manual/cli-and-matrices/).

## Define an eval

An eval composes an Agent Under Test (AUT), user messages, optional fixtures, and scoring rules. Give it a stable lowercase kebab-case `id`; evals, suites, agents, and matrices use IDs, while fixtures do not. Evalkit generates run and trial identities.

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

Default-export an eval under `evals/` and run it with `bun run evalkit run-evals greeting`. The CLI discovers `evals/**/*.eval.ts` and `.js` files automatically: no registry or config is required. These snippets use the starter's internal workspace imports; in a project installed from the single package, import authoring helpers from `@leostera/evalkit` instead. That package is [prepared but not published yet](/docs/manual/project-structure/).

Learn more: [Project structure and discovery](/docs/manual/project-structure/) · [Scorers and evals](/docs/manual/scoring-and-evals/).

## Connect an agent

The **Agent Under Test (AUT)** is the assistant, service, or program being measured—not the judge that grades it. An adapter connects that system to Evalkit. For each trial, Evalkit starts a fresh session, sends the user messages, and records events the adapter emits. Scorers inspect that trajectory and the resulting files.

An adapter implements `start()`, returning a session with `send(message)` and `close()`. `send()` should resolve when the turn finishes; returning an answer alone does not record it. Emit assistant messages as events so they appear in the timeline and can be scored.

```ts
// agents/greeting-agent.ts · essentials
import { defineAgent } from '@evalkit/core';

export const greetingAgent = defineAgent({
  identity: { kind: 'example', id: 'greeting-agent' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ onEvent }) {
    return {
      async send(message: string) {
        await onEvent({
          kind: 'message',
          role: 'assistant',
          content: `Hello, ${message}`,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {},
    };
  },
});
```

Use `context.workspace.root` for candidate-visible files. Never pass `context.evaluatorWorkspace.root` to a model. For a local Pi process, `piAgent()` is available from `@evalkit/agents` inside this workspace (or `@leostera/evalkit` when installed), but it invokes Pi independently for each message.

Learn more: [Agents under test](/docs/manual/agents/).

## Add fixtures

Fixtures are project files or generated inputs copied into isolated workspaces before each trial. Candidate files are visible to the AUT; evaluator files stay private to trusted scoring code. Source paths resolve from the project directory.

```ts
import { directory, file, inlineFile } from '@evalkit/core';

const fixtures = [
  directory('fixtures/starter'),
  file('fixtures/answer.txt', {
    dst: 'answer.txt',
    visibility: 'evaluator',
  }),
  inlineFile('prompt.txt', 'Say hello.', 'candidate'),
];
```

Add `fixtures` to the eval definition. `dynamic()` can generate per-trial inputs using the trial context and random seed. Fixtures need no IDs; destinations must be unique within each trial workspace. Keep expected answers out of candidate files.

Learn more: [Fixtures](/docs/manual/fixtures/).

## Score a trial

A reusable `predicate(...)` is an executable judge. It inspects events and files after the session closes. A numeric score passes only when it is exactly `1`; return an object with `passed` to set a different threshold.

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

The callback can also inspect `artifacts.candidate.root` and `artifacts.evaluator.root`. Score errors are saved, not silently counted as passes.

Learn more: [Scorers and evals](/docs/manual/scoring-and-evals/).

## Read results

Keep eval definitions in Git. Results are **local files**, not automatically committed or shared. Each run lives in `_evalkit-results/<run-id>/`; read its `summary.json` for passed and failed trial counts. Under `trials/<trial-id>/`, inspect `trajectory.jsonl`, `scoring.json`, `summary.json`, and candidate artifacts.

```sh
RUN="_evalkit-results/<run-id>"
jq '{trialCount, passed, failed}' "$RUN/summary.json"
jq -r '.results[] | [.name, .value, .passed] | @tsv' "$RUN"/trials/*/scoring.json
```

> **Important:** Execution status `completed` does not mean the scores passed. Use the run-level `failed` count for a CI gate. Local `_evalkit-sandbox/` directories retain _both_ candidate and evaluator workspaces; review them for sensitive data before sharing.

Learn more: [Results and reports](/docs/manual/results/).

## Configure a project

The starter needs neither a config nor a registry. Add `evalkit.config.js` only to customize discovery, execution limits, or a matrix:

```js
import { defineConfig } from '@evalkit/core';

export default defineConfig({
  testDir: 'evals',
  matrix: {
    id: 'models',
    parameters: { model: ['model-a', 'model-b'] },
    defaults: { turnBudget: 6 },
  },
  execution: { concurrency: 4, maxCells: 100 },
});
```

Paths resolve relative to the config file. You can customize `include`, `exclude`, and `testDir`. An explicit registry supports optional suites. For a runnable provider-free config and parameter sweep, see [`examples/configured-matrix`](https://github.com/leostera/evalkit/tree/main/examples/configured-matrix).

Learn more: [Project structure and discovery](/docs/manual/project-structure/).

## Sweep parameters

A matrix lazily expands evals × parameter axes into independent cells. `--eval` selects an eval ID, `--model` narrows a model axis, and `--dry-run` shows the count before starting anything. Plans above `execution.maxCells` require `--all`.

```sh
bun run evalkit run-matrix models --eval greeting --dry-run
bun run evalkit run-matrix models --eval greeting --model model-a
```

The AUT adapter **must read `context.parameters.model`** to apply a selected model; the built-in `piAgent()` does not do this automatically. Cell keys and effective parameters are saved with the reports. The example model names above illustrate configuration; the [configured-matrix project](https://github.com/leostera/evalkit/tree/main/examples/configured-matrix) uses local text styles instead of real models.

Learn more: [CLI and matrices](/docs/manual/cli-and-matrices/).

## What's next

Use the sidebar to explore the [manual](/docs/manual/) for explicit suites, fixture visibility, scorer contracts, CLI selection, and report processing. The [zero-config starter](https://github.com/leostera/evalkit/tree/main/examples/starter) and [configured matrix](https://github.com/leostera/evalkit/tree/main/examples/configured-matrix) are runnable references.

Today `user(...)`, deterministic `predicate(...)`, agent-backed `judge(...)` (with a separate eval-level `judge` agent), and observed `expectToolCall(...)` transcript steps execute. Predicates and judges also run in final `scoring`. Remote Agents SDK transport, enforced timeouts, and standalone project scaffolding are not yet available. The single package has an external build but its first GitHub Packages release has not yet happened; see [installation notes](/docs/manual/project-structure/).
