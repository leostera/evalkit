# evalkit

The public Bun/TypeScript entry point re-exports `@evalkit/core` and exposes the `evalkit` CLI. Other packages remain separately importable.

```js
// evalkit.config.js
import { defineConfig } from 'evalkit';

export default defineConfig({
  // Discover ./evals/**/*.eval.ts and *.eval.js by default.
  matrix: {
    parameters: {
      model: ['model-a', 'model-b'],
      mode: ['without-docs', 'with-docs'],
    },
    defaults: { turnBudget: 6 },
  },
  execution: { concurrency: 4, maxCells: 100 },
});
```

Each `evals/*.eval.ts` default-exports `defineEval(...)` (or an array). Discovery is sorted and rejects duplicate eval IDs. Use `testDir`, `include`, `exclude`, or an explicit `evals`/`registry` property to customize. `--config file` selects a config relative to the invoking directory; fixture sources resolve relative to that config. Without a config, the CLI discovers `./evals/` by default, as shown in `examples/starter`. An explicit `src/registry.ts` is only necessary when choosing a curated registry or defining suites; a config must include its `registry` property if both are used. See `examples/configured-matrix` for a runnable config and parameter sweep.

```sh
evalkit run-evals --dry-run
evalkit run-evals task-a --model model-a --mode with-docs --max-tokens 10000
evalkit run-matrix default --eval task-a --model model-a,model-b --mode with-docs
evalkit run-suite my-suite --dry-run
```

`--model` and `--mode` select axis values rather than overriding every cell. `--select axis=value` handles other axes. `--param key=JSON`, `--max-tokens`, `--turn-budget`, and `--chat-timeout-ms` override **non-axis** execution parameters. `--trials` overrides the eval trial policy. `--dry-run` reports a count without starting agents. Runs over `execution.maxCells` (100 by default) require explicit `--all`; choose small selections before running large matrices. Resolved parameters and the canonical cell key appear in run and trial manifests.
