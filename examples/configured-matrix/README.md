# Configured matrix example

A runnable project demonstrating **default-export eval discovery** plus an optional `evalkit.config.ts` matrix. The local AUT reads `context.parameters.style` and transforms text; a reusable predicate checks the result. It uses no model provider and costs nothing to run. `lower`/`upper` are sample parameter values, **not** real AI models. A model comparison would require an adapter that applies `context.parameters.model` to its provider call.

Install workspace dependencies at the monorepo root, then:

```bash
cd examples/configured-matrix
bun run plan       # count the two cells without starting the agent
bun run matrix     # run both styles and write local reports
bun run dashboard  # inspect each cell's run and trial
```

To run just one cell:

```bash
bun run evalkit run-matrix letter-case --eval case-transform --select style=upper --local
```

`evalkit.config.ts` defines the `letter-case` matrix and execution limits. `evals/case-transform.eval.ts` is discovered automatically by its default export; no `src/registry.ts` is needed. The runner expands cells lazily, saves effective parameters and a canonical cell key in each manifest, and writes `_evalkit-results/` and `_evalkit-sandbox/` locally (ignored by Git). See `src/run.test.ts` for an isolated, provider-free integration test.
