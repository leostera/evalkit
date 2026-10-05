# EvalKit

**Find out whether your agent did the right thing—and see why.**

EvalKit lets you write agent evaluations as TypeScript: give an Agent Under Test (AUT) a scenario, inspect what it actually said and did, and score the result. Keep eval definitions in Git alongside your code; run them locally and inspect the evidence in a dashboard or ordinary report files.

- **Test the journey, not just the final answer.** Put `predicate(...)`, `judge(...)`, or `expectToolCall(...)` between user turns to check an intermediate reply, observed tool call, or live file state before continuing. `policy.failfast` can skip later turns after a failed checkpoint.
- **Choose how to score.** Run deterministic predicates without model credentials, or provide an independent judge agent for rubric-based verdicts. A judge can have its own tools; its events stay separate from the AUT trajectory. The same rule can run inline and in final scoring.
- **Make failures inspectable.** Reports record turns, checkpoints, skipped steps, final scores, and errors. Trials have isolated candidate and evaluator workspaces, so private expected answers need not be shown to the AUT.
- **Repeat and compare.** Run multiple trials or define a matrix of parameters. An adapter must explicitly apply those parameters to its AUT; EvalKit does not silently switch models.

## Try it locally

Create a standalone, provider-free eval project from the npm package. No model credentials or preinstalled EvalKit package are needed:

```sh
bunx @leostera/evalkit new ./evals
cd evals
bun install
bun run check        # type-check the project
bun run evals         # both configured styles
bun run matrix:plan  # inspect the matrix without executing it
bun run dashboard     # in a second terminal
```

Already have a Bun project? From its root you can instead run:

```sh
bun add @leostera/evalkit
bun run evalkit new .
bun install          # install the generated type-checking dependencies
bun run check
bun run evals
```

Migrating from the former `@leostera-js/evalkit` package? Replace that dependency with `@leostera/evalkit`, update imports (including `/runner`), then run `bun install`. Existing eval definitions and local reports do not need to be regenerated.

The generator creates `agents/`, `fixtures/`, `evals/`, and `judges/`, plus `evalkit.config.ts` with a runnable matrix and `tsconfig.json` for type-checking. Its `greeting` eval is provider-free: the agent reads a fixture, applies `context.parameters.style`, and a predicate checks the reply. `bun run evals` exercises both matrix cells; `bun run matrix` runs the named matrix. Add another default-exported `.eval.ts` file to grow your suite—no registry required. Replace the example agent with your own adapter when ready.

In-place setup preserves existing dependencies, scripts, README, and eval files; it refuses to overwrite any of the generated paths, including an existing config. The project installs `@leostera/evalkit` from npm. For more runnable examples, see [`examples/starter`](examples/starter/) and [`examples/interleaved-scenario`](examples/interleaved-scenario/).

Runs create `_evalkit-results/` and `_evalkit-sandbox/` in the generated project directory. Eval definitions can be versioned in Git; reports and workspaces remain local and are **not automatically shared**. Review them for sensitive data before sharing.

## Explore more

- [Get started](www/src/content/docs/index.md) and the [manual](www/src/content/docs/manual/) explain adapters, fixtures, scoring, reports, and the CLI.
- [Interleaved scenario](examples/interleaved-scenario/) has a passing write/revise flow, an intentional failfast failure, and a provider-free fake judge agent.
- [Configured matrix](examples/configured-matrix/) shows a runnable parameter sweep without model credentials.
- [HACKING.md](HACKING.md) covers the repository layout, builds, and tests for contributors.

EvalKit currently runs locally with Bun. Remote Agents SDK transport, enforced timeouts and cancellation, and operation-wide safeguards for shared resources are not implemented. The root of this repository is the publishable `@leostera/evalkit` package.
