---
title: Project structure and discovery
description: Set up an eval project, discover evals, configure execution, and organize suites and IDs.
---

A local EvalKit project is a directory from which you run the CLI. The generated starter has all the usual places to write code and a provider-free matrix:

```text
my-project/
├── scenarios/greeting.eval.ts    # default-exported scenario, discovered automatically
├── agents/greeting-agent.ts      # AUT adapter
├── datasets/greeting.dataset.ts  # files copied into each trial's workspace
├── datasets/greeting/            # the dataset's files
├── judges/matches-greeting.ts    # deterministic scorer
├── evalkit.config.ts             # styles matrix and execution settings
├── tsconfig.json                 # strict type-checking for authored code
└── package.json
```

A scenario is one concrete conversation, so a suite of a hundred scenarios is a hundred small files in `scenarios/`. Agents, datasets and judges are defined once in their own directories and imported; nothing is discovered from those directories, so a broken dataset only affects the scenarios that import it.

The CLI imports each scenario module, so its imports must resolve in your project. Run commands from `my-project/`; dataset paths resolve from the project root, not from each file. Output defaults to `_evalkit-results/` and `_evalkit-sandbox/` there. When using `--config path/to/evalkit.config.ts`, the **config file's directory** becomes the project root even if the command was launched elsewhere.

## Getting the CLI and API

The root of this public repository builds the **`@leostera/evalkit`** npm package. Create a standalone project without a preinstalled package:

```sh
bunx @leostera/evalkit new ./agent-evals
cd agent-evals
bun install
bun run check
bun run evalkit run
```

For an existing Bun project, use `bun add @leostera/evalkit` and then `bun run evalkit new .` from its root. Run `bun install` afterward to install the generated type-checking dependencies. This keeps existing package metadata, scripts, README, and authored scenarios; an existing scaffold path (including `evalkit.config.ts` or `scenarios/greeting.eval.ts`) causes an explicit error before any changes are made. The generated `package.json` installs `@leostera/evalkit` from npm. Import authoring helpers from `@leostera/evalkit` and runner helpers from `@leostera/evalkit/runner`, **not** the monorepo's internal `@evalkit/*` workspace names. The generated scenario is provider-free; its results and trial workspaces stay local. When contributing to this repository, `examples/starter` and `examples/configured-matrix` still use internal workspace imports.

### Migrating from the previous npm scope

Replace `@leostera-js/evalkit` with `@leostera/evalkit` in `package.json` and all imports, including `@leostera/evalkit/runner`, then run `bun install`. Existing eval files and local reports do not need to be regenerated. The old scope is a separate npm package and does not automatically redirect to the new one.

## Automatic discovery

With no explicit registry or eval list, the CLI scans `scenarios/` recursively for `**/*.eval.ts` and `**/*.eval.js` in sorted path order. A matching file must **default-export** one eval or an array of evals; named exports alone are not discovered. Helper files, `*.test.ts`, and unrelated files are not entries. Symlinks and `node_modules`, `.git`, and `_evalkit-*` directories are skipped. A missing directory, no matching files, or duplicate IDs cause errors rather than an empty run. A project that still has `evals/` from EvalKit 0.5 gets an error saying to move it or set `testDir: 'evals'`.

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

Give every scenario a distinct ID, even across different files. For the full definition and scorer contracts, see [Scorers and evals](/docs/manual/scoring-and-evals/).

### Load errors

Each file is imported on its own. A file that throws while importing (for example, because a credential is not set) becomes a **load error** for that file only:

| Command                                           | With a load error                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `run` selecting only healthy scenarios            | Runs them and prints the load error as a warning.                                          |
| `run` selecting a broken file's scenarios, or all | Fails before running anything, naming the file. `--skip-broken` runs the rest and exits 1. |
| `run --dry-run`, `build`, `dev`, `tidy`, `share`  | Warn and continue. `dev` shows the error in the dashboard.                                 |

A config or explicit registry that throws still stops every command, because EvalKit cannot tell which scenarios it defines. Prefer doing expensive or credentialed work in a dataset's `onLoad`, which runs when a trial needs it rather than at import.

## Configuration and precedence

The generated project already has one `evalkit.config.ts` with a `styles` matrix. In other projects, create **one** `evalkit.config.ts`, `.js`, or `.mjs` at the project root only if you need customization. If several exist, pass `--config` to disambiguate. A config must default-export an object; `defineConfig(...)` supplies TypeScript inference but does not load files itself.

```ts
// evalkit.config.ts
import { DEFAULT_ARTIFACT_EXCLUDE, defineConfig } from '@leostera/evalkit';

export default defineConfig({
  testDir: 'scenarios',
  // Globs are relative to testDir; these replace the default includes.
  include: ['**/*.eval.ts', '**/*.eval.js'],
  // Custom excludes add to the built-in exclusions.
  exclude: ['**/experimental/**'],
  execution: { concurrency: 4, trials: 2, maxCells: 100 },
  reportDir: '_evalkit-results',
  sandboxDir: '_evalkit-sandbox',
  keepSandboxes: 'failed',
  // Replaces the default; spread DEFAULT_ARTIFACT_EXCLUDE to extend it.
  artifacts: { exclude: [...DEFAULT_ARTIFACT_EXCLUDE, 'dist', '*.log'] },
});
```

| Setting                         | Effect                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testDir`, `include`, `exclude` | Change the directory (default `scenarios`) and globs used for discovery. Default includes are `**/*.eval.ts` and `**/*.eval.js`; custom excludes are additive.                                                                  |
| `evals`                         | Supply an explicit array of eval definitions instead of discovering files.                                                                                                                                                      |
| `registry`                      | Supply an explicit `registerEvals(...)` registry. Takes precedence over `evals` and discovery.                                                                                                                                  |
| `matrix`                        | Add a matrix over **all registered evals**; if omitted, ordinary `run` still runs each eval once. See [CLI and matrices](/docs/manual/cli-and-matrices/).                                                                       |
| `discovery.suites`              | `false` stops directories from forming suites. Default `true`.                                                                                                                                                                  |
| `execution`                     | Defaults for cell concurrency (4), trial override (otherwise each eval's policy), and maximum cells (100). Values must be positive integers.                                                                                    |
| `reportDir`, `sandboxDir`       | Project-root-relative local output paths. Provide your own Git ignore and retention rules.                                                                                                                                      |
| `keepSandboxes`                 | Which trial workspaces stay in `sandboxDir` after a run: `'failed'` (default, trials that did not pass), `'all'` or `'none'`.                                                                                                   |
| `artifacts.exclude`             | Candidate paths left out of each trial's saved snapshot. A pattern without `/` matches that name at any depth. Default `DEFAULT_ARTIFACT_EXCLUDE`: `.git`, `node_modules`, `.venv`, `__pycache__`, `_build`, `_opam`, `target`. |

Without a config, a default export from `src/registry.ts` is accepted as a legacy explicit registry. Once a config exists, that implicit registry is **not** loaded: set `registry` in the config to use it. `registry` > `evals` > discovery is the selection order. Prefer discovery for ordinary projects; use a registry only when you need full control over suites or explicitly registered matrices.

## Suites

Each directory directly below `scenarios/` is a suite, named after the directory: `scenarios/billing/refunds.eval.ts` and `scenarios/billing/eu/vat.eval.ts` are both in suite `billing`. Suite directory names must be lowercase kebab-case. Files directly in `scenarios/` have no suite. `run --suite billing` selects a suite's scenarios, and the dashboard and the run summary group by suite. Set `discovery.suites: false` to turn this off.

## Authoring IDs

Authored scenarios, suites, datasets, agent identities, and matrices use a stable lowercase kebab-case `id` such as `polite-greeting`. IDs must be unique within their category; use distinct agent identities for clear reporting. CLI selection is by **ID**, while optional `name` is for display. The runner generates UUIDs and `evalkit:run:...` / `evalkit:trial:...` URIs for executions, not for definitions.

## Explicit registries

A registry replaces discovery and directory suites entirely. Import members and register them **only through their suite**; duplicate registrations fail.

```ts
// evalkit.config.ts
import { defineConfig, defineSuite, registerEvals } from '@leostera/evalkit';
import greeting from './scenarios/greeting.eval.js';
import farewell from './scenarios/farewell.eval.js';

export default defineConfig({
  registry: registerEvals([
    defineSuite({
      id: 'conversation-basics',
      name: 'Conversation basics',
      evals: [greeting, farewell],
    }),
  ]),
});
```

Without a config, a default export from `src/registry.ts` is accepted as an explicit registry. A matrix registered explicitly in a registry does **not** register its evals for normal `run`: list those evals or their suite as registrations too.

Use [`examples/starter`](https://github.com/leostera/evalkit/tree/main/examples/starter) for discovery and [`examples/configured-matrix`](https://github.com/leostera/evalkit/tree/main/examples/configured-matrix) for a config-backed sweep. Before dispatching a new setup, check `bun run evalkit run --dry-run` from its project directory.
