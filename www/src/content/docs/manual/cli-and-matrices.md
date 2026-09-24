---
title: CLI and matrices
description: Run evals and suites, select parameter cells, and inspect a dry run.
---

Run these from the project directory (`examples/starter` for the included example):

```sh
bun run evalkit run-evals                        # all discovered evals (or an explicit registry)
bun run evalkit run-evals greeting               # select an eval ID
bun run evalkit run-evals greeting --json
bun run evalkit run-evals greeting --concurrency 4
bun run evalkit serve-dashboard
```

Running every discovered eval in the starter also starts the Pi-backed examples; those require a working `pi` command and model access and may incur costs. Select `greeting` for a provider-free run. If you defined an explicit suite in a registry, run it with `bun run evalkit run-suite my-suite`; the zero-config starter does not define suites. For a matrix, use the [configured example](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/README.md).

`--json` emits one JSON object per completed matrix cell, including its key, eval ID, parameters, and run result. `--concurrency <positive integer>` bounds parallel cells (default 4). Be mindful of API rate limits and provider costs.

The CLI also accepts `--model`, `--max-tokens`, `--chat-timeout-ms`, and `--turn-budget`; these become `context.parameters` for adapters that implement them. **The built-in `piAgent()` does not consume these parameters.** Its `args` option is set when constructing `piAgent({ args: [...] })`. Use `--trials <positive integer>` to override `policy.trials` for a run.

Optional matrices lazily expand a Cartesian product of parameter axes. With default-exported `evals/*.eval.ts` files, configure one in `evalkit.config.js` (or see the runnable [configured-matrix](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/README.md) project):

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
