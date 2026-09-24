---
title: Project structure and discovery
description: Project setup, automatic discovery, stable IDs, explicit suites, and configuration.
---

A typical local project looks like this:

```text
my-project/
├── evalkit.config.js           # optional project configuration
├── agents/my-agent.ts          # AUT adapters
├── evals/my-eval.eval.ts       # default-exported eval
├── judges/my-judges.ts         # predicate scorers
└── fixtures/my-case/          # input files
```

There is no dedicated `evalkit init` command yet; `bun create github.com/leostera/evalkit` copies the entire repository. For a new project **inside this monorepo**, use `examples/starter` as a template, give it a `package.json` with workspace dependencies on `@evalkit/core`, `@evalkit/runner`, and `@evalkit/cli` (plus `@evalkit/agents` if using Pi), then run `bun install` at the repository root. The workspace packages are internal; `@leostera/evalkit` builds a single installable artifact with the CLI, API, and dashboard. The first GitHub Packages release has not been published yet. For installation after release, see [package setup](https://github.com/leostera/evalkit/blob/main/packages/evalkit/README.md#install-from-github-packages). Outside this monorepo, import authoring helpers from `@leostera/evalkit` instead of the internal `@evalkit/core` or `@evalkit/agents`; low-level runner helpers live at `@leostera/evalkit/runner`. For the usual workflow, put a default-exported eval in `evals/*.eval.ts` and run it by `id`: no registry or config file is required. See the [complete eval example](/docs/manual/scoring-and-evals/).

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

Choose a stable, unique lowercase kebab-case `id` for suites, evals, agents, and matrices. Fixtures have no IDs: their destination and visibility within an eval determine where they materialize. Authored `uri`, `uuid`, and `slug` fields are not supported. IDs are exact-match selectors in the CLI and dashboard; `name` is only a display label. Run and trial IDs/URIs are generated at execution time. See [`packages/core/src/identity.ts`](https://github.com/leostera/evalkit/blob/main/packages/core/src/identity.ts).

## Configuration and discovery

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
