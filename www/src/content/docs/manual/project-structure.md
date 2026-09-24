---
title: Project structure and discovery
description: Set up an eval project, discover evals, configure execution, and organize suites and IDs.
---

A local Evalkit project is a directory from which you run the CLI. No config or registry is required for a default-exported eval:

```text
my-project/
├── evals/greeting.eval.ts     # discovered by default
├── agents/greeting-agent.ts   # AUT adapter imported by the eval
├── judges/greeting.ts        # reusable predicate imported by the eval
└── fixtures/example/         # optional project-relative input
```

The CLI imports the eval module, so its agent and scorer imports must resolve in your project. Run commands from `my-project/`; the CLI finds evals and resolves fixture `src` paths from the project root, not from each eval file. Output defaults to `_evalkit-results/` and `_evalkit-sandbox/` there. When using `--config path/to/evalkit.config.ts`, the **config file's directory** becomes the project root even if the command was launched elsewhere.

## Getting the CLI and API

Inside this repository, `examples/starter` and `examples/configured-matrix` use internal `@evalkit/*` workspace packages. After `bun install` at the repository root, run their `bun run evalkit ...` commands from the example directory. The starter's `greeting` eval is provider-free; running _all_ its evals also runs Pi examples that need a working `pi` command and model access.

For projects outside this monorepo, the prepared consumer package is **`@leostera/evalkit`**, containing the authoring API, CLI, Pi adapter, runner subpath, and dashboard. Its first GitHub Packages release **has not been published yet**. After publication, authenticate Bun to GitHub Packages and install it as described in the [package installation instructions](https://github.com/leostera/evalkit/blob/main/packages/evalkit/README.md#install-from-github-packages). Import authoring helpers from `@leostera/evalkit` and low-level runner helpers from `@leostera/evalkit/runner`, **not** the internal `@evalkit/*` names. The examples on this site use the repository's workspace imports unless otherwise noted. There is no `evalkit init` command; `bun create github.com/leostera/evalkit` copies the whole repository, not a standalone eval project.

## Automatic discovery

With no explicit registry or eval list, the CLI scans `evals/` recursively for `**/*.eval.ts` and `**/*.eval.js` in sorted path order. A matching file must **default-export** one eval or an array of evals; named exports alone are not discovered. `evals/helper.ts`, `*.test.ts`, and unrelated files are not eval entries. Symlinks and `node_modules`, `.git`, and `_evalkit-*` directories are skipped. Missing eval directories, no matching evals, or duplicate IDs cause errors rather than an empty run.

```ts
// evals/greeting.eval.ts
import { defineEval, user } from '@evalkit/core';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
});
```

An array default export is also supported when several evals belong in one file. Give every eval a distinct ID, even across different files. For the full definition and scorer contracts, see [Scorers and evals](/docs/manual/scoring-and-evals/).

## Configuration and precedence

Create **one** `evalkit.config.ts`, `.js`, or `.mjs` at the project root only if you need customization. If several exist, pass `--config` to disambiguate. A config must default-export an object; `defineConfig(...)` supplies TypeScript inference but does not load files itself.

```ts
// evalkit.config.ts
import { defineConfig } from '@evalkit/core';

export default defineConfig({
  testDir: 'evals',
  // Globs are relative to testDir; these replace the default includes.
  include: ['**/*.eval.ts', '**/*.eval.js'],
  // Custom excludes add to the built-in exclusions.
  exclude: ['**/experimental/**'],
  execution: { concurrency: 4, trials: 2, maxCells: 100 },
  reportDir: '_evalkit-results',
  sandboxDir: '_evalkit-sandbox',
});
```

| Setting                         | Effect                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testDir`, `include`, `exclude` | Change the directory and globs used for discovery. Default includes are `**/*.eval.ts` and `**/*.eval.js`; custom excludes are additive.                        |
| `evals`                         | Supply an explicit array of eval definitions instead of discovering files.                                                                                      |
| `registry`                      | Supply an explicit `registerEvals(...)` registry (for example, for suites). Takes precedence over `evals` and discovery.                                        |
| `matrix`                        | Add a matrix over **all registered evals**; if omitted, ordinary `run-evals` still runs each eval once. See [CLI and matrices](/docs/manual/cli-and-matrices/). |
| `execution`                     | Defaults for cell concurrency (4), trial override (otherwise each eval's policy), and maximum cells (100). Values must be positive integers.                    |
| `reportDir`, `sandboxDir`       | Project-root-relative local output paths. Provide your own Git ignore and retention rules.                                                                      |

Without a config, a default export from `src/registry.ts` is accepted as a legacy explicit registry. Once a config exists, that implicit registry is **not** loaded: set `registry` in the config to use it. `registry` > `evals` > discovery is the selection order. Prefer discovery for ordinary projects; use a registry when you need suites or explicitly registered matrices.

## Authoring IDs and suites

Authored evals, suites, agent identities, and matrices use a stable lowercase kebab-case `id` such as `polite-greeting`. Eval, suite, and matrix IDs must be unique within their category in a registry; use distinct agent identities for clear reporting. CLI selection is by **ID**, while optional `name` is for display. Do not add authored `uri`, `uuid`, or `slug` fields. Fixtures have no IDs. The runner generates UUIDs and `evalkit:run:...` / `evalkit:trial:...` URIs for executions, not for definitions.

To group evals, explicitly register a suite. A suite ID is a single kebab-case ID, not a nested path. Import its members and register them **only through the suite**; duplicate registrations fail.

```ts
// src/registry.ts (no config file)
import { defineSuite, registerEvals } from '@evalkit/core';
import greeting from '../evals/greeting.eval.js';
import farewell from '../evals/farewell.eval.js';

export default registerEvals([
  defineSuite({
    id: 'conversation-basics',
    name: 'Conversation basics',
    evals: [greeting, farewell],
  }),
]);
```

With a config, import this registry there and set `registry: ...`. Discovered eval files do **not** implicitly form suites. `run-suite conversation-basics` selects the suite's evals; the dashboard can display them under the suite. A matrix registered explicitly in a registry does **not** register its evals for normal `run-evals`: list those evals or their suite as registrations too.

Use [`examples/starter`](https://github.com/leostera/evalkit/tree/main/examples/starter) for discovery and [`examples/configured-matrix`](https://github.com/leostera/evalkit/tree/main/examples/configured-matrix) for a config-backed sweep. Before dispatching a new setup, check `bun run evalkit run-evals --dry-run` from its project directory.
