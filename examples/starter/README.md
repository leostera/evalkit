# EvalKit starter example

A runnable, **zero-config** EvalKit project. The CLI discovers the default exports of `evals/*.eval.ts` automatically; there is no registry or `evalkit.config.js` to maintain. Each eval has a human-readable ID.

From this repository, install workspace dependencies at the root and then:

```bash
cd examples/starter
bun run greeting    # run only the self-contained eval (no Pi or provider needed)
bun run dashboard   # inspect its trials in the local dashboard
```

`bun run evals` runs **all** discovered evals, including the Pi-backed examples. Those require a working `pi` command and configured model access and may incur costs. To run just one directly, use `bun run evalkit run-evals greeting --trials 1`; inspect the selection with `--dry-run` first.

The greeting eval composes a project-owned Agent Under Test (AUT), the candidate-visible `directory('fixtures/starter')`, and a reusable predicate scorer. Fixture source paths resolve from this project directory. Runs write `_evalkit-results/` and isolated trial workspaces under `_evalkit-sandbox/`; both are ignored by Git. Local evaluator workspaces can contain sensitive data, so review reports and sandboxes before sharing.

See [`src/run.test.ts`](src/run.test.ts) for a discovery and report smoke test. For an optional `evalkit.config.js` with a parameter matrix, see [`../configured-matrix/`](../configured-matrix/). The Agents SDK transport in [`../agents-sdk/`](../agents-sdk/) is not runnable yet.
