# EvalKit starter example

A runnable, **zero-config** EvalKit project. The CLI discovers the default exports of `scenarios/**/*.eval.ts` automatically; there is no registry or `evalkit.config.js` to maintain. Each eval has a human-readable ID.

From this repository, install workspace dependencies at the root and then:

```bash
cd examples/starter
bun run evalkit run greeting --trials 1  # only the self-contained eval (no Pi or provider needed)
bun run evalkit dev                      # inspect its trials in the local dashboard
```

`bun run evalkit run` runs **all** discovered evals, including the Pi-backed examples. Those require a working `pi` command and configured model access and may incur costs. Inspect any selection with `--dry-run` first.

The greeting scenario composes a project-owned Agent Under Test (AUT), the candidate-visible `starter` dataset from `datasets/`, and a reusable predicate scorer. Dataset paths resolve from this project directory. Runs write `_evalkit-results/` and isolated trial workspaces under `_evalkit-sandbox/`; both are ignored by Git. Local evaluator workspaces can contain sensitive data, so review reports and sandboxes before sharing.

See [`src/run.test.ts`](src/run.test.ts) for a discovery and report smoke test. For an optional `evalkit.config.js` with a parameter matrix, see [`../configured-matrix/`](../configured-matrix/). The Agents SDK transport in [`../agents-sdk/`](../agents-sdk/) is not runnable yet.
