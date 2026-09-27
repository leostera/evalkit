---
title: Get started
description: Run a local agent eval, then learn how to author and score your own.
---

An eval tells EvalKit what task to give your agent, which agent to run, and how to score what happened. Write it as TypeScript, keep definitions in Git, and inspect each run as local files. This guide follows the current Bun implementation; the [manual](/docs/manual/) covers the full contracts.

## First run

Create a standalone project from the public repository. Its first eval uses an in-process agent and requires no Pi, model credentials, or registry token:

```sh
bunx https://github.com/leostera/evalkit.git new ./evals
cd evals
bun install
bun run check         # type-check the scaffold
bun run evals         # run both provider-free styles
bun run matrix:plan   # preview the configured matrix
bun run dashboard     # start this in another terminal to inspect reports
```

To add EvalKit to an **existing Bun project** instead, run `bun add https://github.com/leostera/evalkit` and then `bun run evalkit new .` from its root, then `bun install` to add TypeScript and Bun types for `bun run check`. This preserves existing scripts, dependencies, and README; it refuses to overwrite any generated path (including an existing `evalkit.config.ts`). Include the `.git` suffix in the `bunx` URL: Bun 1.4.2 cannot determine an executable for the bare HTTPS repository URL. The Git URL installs the executable package at this repository's root; the generated project installs the **same public Git package**. No npm release is required. **Run commands from your eval project directory**: EvalKit discovers eval files, resolves fixtures, and writes reports there. The generated project contains `agents/`, `fixtures/`, `evals/`, `judges/`, `evalkit.config.ts`, and `tsconfig.json`. Its provider-free `greeting` eval runs across two configured styles; discovery needs no registry.

Learn more: [CLI and matrices](/docs/manual/cli-and-matrices/).

## Define an eval

An eval composes an Agent Under Test (AUT), user messages, optional fixtures, and scoring rules. Give it a stable lowercase kebab-case `id`; evals, suites, agents, and matrices use IDs, while fixtures do not. EvalKit generates run and trial identities.

```ts
// evals/greeting.eval.ts
import { defineEval, file, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [file('fixtures/greeting.txt', { dst: 'greeting.txt', visibility: 'candidate' })],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});
```

Default-export an eval under `evals/` and run it with `bun run evalkit run-evals greeting`. The CLI discovers `evals/**/*.eval.ts` and `.js` files automatically: no registry or config is required. This is the generated `evals/greeting.eval.ts`. Edit it or add another default-exported `.eval.ts` file; `evalkit.config.ts` already defines the `styles` matrix. The `@leostera/evalkit` import resolves from the public Git package installed by `bun install`.

Learn more: [Project structure and discovery](/docs/manual/project-structure/) · [Scorers and evals](/docs/manual/scoring-and-evals/).

## Connect an agent

The **Agent Under Test (AUT)** is the assistant, service, or program being measured—not the judge that grades it. An adapter connects that system to EvalKit. For each trial, EvalKit starts a fresh session, sends the user messages, and records events the adapter emits. Scorers inspect that trajectory and the resulting files.

An adapter implements `start()`, returning a session with `send(message)` and `close()`. `send()` should resolve when the turn finishes; returning an answer alone does not record it. Emit assistant messages as events so they appear in the timeline and can be scored.

```ts
// agents/greeting-agent.ts · essentials of the generated adapter
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@leostera/evalkit';

export const greetingAgent = defineAgent({
  identity: { kind: 'in-process', id: 'greeting-agent' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context, onEvent }) {
    return {
      async send(message: string) {
        const prefix = (await readFile(join(context.workspace.root, 'greeting.txt'), 'utf8')).trim();
        const greeting = `${prefix}, ${message}!`;
        await onEvent({
          kind: 'message', role: 'assistant',
          content: context.parameters?.style === 'shout' ? greeting.toUpperCase() : greeting,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {},
    };
  },
});
```

Use `context.workspace.root` for candidate-visible files. Never pass `context.evaluatorWorkspace.root` to a model. For a local Pi process, `piAgent()` is available from `@leostera/evalkit`, but it invokes Pi independently for each message.

Learn more: [Agents under test](/docs/manual/agents/).

## Add fixtures

Fixtures are project files or generated inputs copied into isolated workspaces before each trial. Candidate files are visible to the AUT; evaluator files stay private to trusted scoring code. Source paths resolve from the project directory.

The generated `fixtures/greeting.txt` contains `Hello`. Its eval copies that file to the AUT's candidate workspace with `file('fixtures/greeting.txt', { dst: 'greeting.txt', visibility: 'candidate' })` before each trial. The generated agent reads it to form a reply. For private reference answers, use `visibility: 'evaluator'` instead. `directory()`, `inlineFile()`, and `dynamic()` support larger or generated inputs. Fixtures need no IDs; destinations must be unique within each trial workspace. Keep expected answers out of candidate files.

Learn more: [Fixtures](/docs/manual/fixtures/).

## Score a trial

A reusable `predicate(...)` is an executable judge. It inspects events and files after the session closes. A numeric score passes only when it is exactly `1`; return an object with `passed` to set a different threshold.

```ts
// judges/matches-greeting.ts
import { predicate } from '@leostera/evalkit';

export const matchesGreeting = predicate('matches greeting and style', ({ context, trajectory }) => {
  const reply = trajectory.events.filter(
    (event) => event.source === 'aut' && event.kind === 'message' && event.role === 'assistant',
  ).at(-1);
  const expected = context.parameters?.style === 'shout' ? 'HELLO, ADA!' : 'Hello, Ada!';
  return { value: reply?.kind === 'message' && reply.content === expected ? 1 : 0 };
});
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
bun run matrix:plan
bun run matrix
bun run evalkit run-matrix styles --eval greeting --select style=shout
```

A selected parameter only affects the AUT when its adapter reads and applies it. The built-in `piAgent()` does not automatically switch models based on a `model` parameter. Cell keys and effective parameters are saved with the reports.

Learn more: [CLI and matrices](/docs/manual/cli-and-matrices/).

## What's next

Use the sidebar to explore the [manual](/docs/manual/) for explicit suites, fixture visibility, scorer contracts, CLI selection, and report processing. The generated project is a runnable reference for project layout and matrix configuration; the [zero-config starter](https://github.com/leostera/evalkit/tree/main/examples/starter) and [interleaved scenario](https://github.com/leostera/evalkit/tree/main/examples/interleaved-scenario) show additional eval patterns.

Today `user(...)`, deterministic `predicate(...)`, agent-backed `judge(...)` (with a separate eval-level `judge` agent), and observed `expectToolCall(...)` transcript steps execute. Predicates and judges also run in final `scoring`. Remote Agents SDK transport and enforced timeouts are not available. The root Git package is usable without an npm release; see [project setup](/docs/manual/project-structure/).
