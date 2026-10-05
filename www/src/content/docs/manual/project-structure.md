---
title: Project structure and discovery
description: Set up an eval project, discover evals, configure execution, and organize suites and IDs.
---

A local EvalKit project is a directory from which you run the CLI. The generated starter has all the usual places to write code and a provider-free matrix:

```text
my-project/
├── agents/greeting-agent.ts   # AUT adapter
├── fixtures/greeting.txt     # candidate-visible example input
├── evals/greeting.eval.ts     # default-exported eval, discovered automatically
├── judges/matches-greeting.ts # deterministic scorer
├── evalkit.config.ts         # styles matrix and execution settings
├── tsconfig.json             # strict type-checking for authored code
└── package.json              # local check, run, matrix, and dashboard scripts
```

You can add more default-exported eval files without editing a registry. A config is optional in other projects; this starter includes one to demonstrate a working parameter matrix.

The CLI imports the eval module, so its agent and scorer imports must resolve in your project. Run commands from `my-project/`; the CLI finds evals and resolves fixture `src` paths from the project root, not from each eval file. Output defaults to `_evalkit-results/` and `_evalkit-sandbox/` there. When using `--config path/to/evalkit.config.ts`, the **config file's directory** becomes the project root even if the command was launched elsewhere.

## Getting the CLI and API

The root of this public repository builds the **`@leostera/evalkit`** npm package. Create a standalone project without a preinstalled package:

```sh
bunx @leostera/evalkit new ./evals
cd evals
bun install
bun run check
bun run evals
```

For an existing Bun project, use `bun add @leostera/evalkit` and then `bun run evalkit new .` from its root. Run `bun install` afterward to install the generated type-checking dependencies. This keeps existing package metadata, scripts, README, and authored evals; an existing scaffold path (including `evalkit.config.ts` or `evals/greeting.eval.ts`) causes an explicit error before any changes are made. The generated `package.json` installs `@leostera/evalkit` from npm. Import authoring helpers from `@leostera/evalkit` and runner helpers from `@leostera/evalkit/runner`, **not** the monorepo's internal `@evalkit/*` workspace names. The generated eval is provider-free; its results and trial workspaces stay local. When contributing to this repository, `examples/starter` and `examples/configured-matrix` still use internal workspace imports.

### Migrating from the previous npm scope

Replace `@leostera-js/evalkit` with `@leostera/evalkit` in `package.json` and all imports, including `@leostera/evalkit/runner`, then run `bun install`. Existing eval files and local reports do not need to be regenerated. The old scope is a separate npm package and does not automatically redirect to the new one.

## Automatic discovery

With no explicit registry or eval list, the CLI scans `evals/` recursively for `**/*.eval.ts` and `**/*.eval.js` in sorted path order. A matching file must **default-export** one eval or an array of evals; named exports alone are not discovered. `evals/helper.ts`, `*.test.ts`, and unrelated files are not eval entries. Symlinks and `node_modules`, `.git`, and `_evalkit-*` directories are skipped. Missing eval directories, no matching evals, or duplicate IDs cause errors rather than an empty run.

```ts
// evals/greeting.eval.ts
import { defineEval, file, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [
    file('fixtures/greeting.txt', {
      dst: 'greeting.txt',
      visibility: 'candidate',
    }),
  ],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});
```

An array default export is also supported when several evals belong in one file. Give every eval a distinct ID, even across different files. For the full definition and scorer contracts, see [Scorers and evals](/docs/manual/scoring-and-evals/).

## Configuration and precedence

The generated project already has one `evalkit.config.ts` with a `styles` matrix. In other projects, create **one** `evalkit.config.ts`, `.js`, or `.mjs` at the project root only if you need customization. If several exist, pass `--config` to disambiguate. A config must default-export an object; `defineConfig(...)` supplies TypeScript inference but does not load files itself.

```ts
// evalkit.config.ts
import { defineConfig } from '@leostera/evalkit';

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
import { defineSuite, registerEvals } from '@leostera/evalkit';
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
