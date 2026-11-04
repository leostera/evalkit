# EvalKit

**Find out whether your agent did the right thing—and see why.**

EvalKit lets you write agent evaluations as TypeScript: give an Agent Under Test (AUT) a scenario, inspect what it actually said and did, and score the result. Write each scenario as a small file, share agents, judges and datasets between them, and keep them in Git alongside your code; run them locally and inspect the evidence in a dashboard or ordinary report files.

![A failed run in the EvalKit dashboard: the conversation, and why each check and judge decided, with the prompt the judge saw.](https://evalkit.leostera.dev/images/dashboard-run.webp)

- **Run the agents you already use.** `piAgent()`, `codexAgent()`, `opencodeAgent()` and `claudeCodeAgent()` run a coding agent's CLI for each run, in its own session and workspace, and keep its own session file as the run's [ATXF](https://atxf.leostera.dev) transcript. `defineAgent()` connects anything else.
- **Test the journey, not just the final answer.** Put `predicate(...)`, `judge(...)`, or `expectToolCall(...)` between user turns to check an intermediate reply, observed tool call, or live file state before continuing. `policy.failfast` can skip later turns after a failed checkpoint.
- **Choose how to score.** Run deterministic predicates without model credentials, or write a rubric and let a judge agent grade it: EvalKit builds the prompt, enforces the answer format (a value, `choices` or weighted `criteria`) and records the prompt, reply, model and judging cost apart from the agent's. A matrix axis can pick the judge's model. The same rule can run inline and in final scoring.
- **Make failures inspectable.** Reports record turns, checkpoints, skipped steps, final scores, and errors. Each run has its own candidate and evaluator workspaces, so expected answers stay out of the agent's reach.
- **Give every run its own machine.** `defineSandbox()` runs a scenario on this machine, in a container per run, or on a remote machine you provide. Limits on steps, tokens and time stop runs that go too far, and fixtures start the services runs need.
- **Repeat and compare.** Run multiple runs or define a matrix of parameters. An adapter must explicitly apply those parameters to its AUT; EvalKit does not silently switch models.
- **Gate merge requests.** `--junit` gives CI a test report, and `evalkit compare` shows what regressed or improved against the base branch and can fail the pipeline.

## Try it locally

Create a standalone, provider-free eval project from the npm package. No model credentials or preinstalled EvalKit package are needed:

```sh
bunx @leostera/evalkit new ./agent-evals
cd agent-evals
bun install
bun run check                                  # type-check the project
bun run evalkit run                            # both configured styles
bun run evalkit run --matrix styles --dry-run  # inspect the matrix without executing it
bun run evalkit dev                            # browse results and launch runs
bun run evalkit build                          # optional read-only snapshot to share
bun run evalkit share                          # optional: upload this commit's results to your share server
```

Already have a Bun project? From its root you can instead run:

```sh
bun add @leostera/evalkit
bun run evalkit new .
bun install          # install the generated type-checking dependencies
bun run check
bun run evalkit run
```

Migrating from the former `@leostera-js/evalkit` package? Replace that dependency with `@leostera/evalkit`, update imports (including `/runner`), then run `bun install`. Existing eval definitions and local reports do not need to be regenerated.

The generator creates `scenarios/`, `agents/`, `datasets/`, and `judges/`, plus `evalkit.config.ts` with a runnable matrix and `tsconfig.json` for type-checking. Its `greeting` scenario is provider-free: the agent reads a file from a dataset, applies `context.parameters.style`, and a predicate checks the reply. `bun run evalkit run` exercises both matrix cells; `bun run evalkit run --matrix styles` runs the named matrix. Every command is `bun run evalkit <command>`; the scaffold adds no script aliases. Add another default-exported `.eval.ts` file to `scenarios/` to grow your suite, and a directory to start another suite—no registry required. Replace the example agent with your own adapter when ready.

In-place setup preserves existing dependencies, scripts, README, and scenario files; it refuses to overwrite any of the generated paths, including an existing config. The project installs `@leostera/evalkit` from npm. For more runnable examples, see [`examples/starter`](examples/starter/) and [`examples/interleaved-scenario`](examples/interleaved-scenario/).

Runs write reports to `_evalkit-results/` in the project, and run their agents in workspaces outside it (`$TMPDIR/evalkit/<project>-<hash>/`), so an agent does not find the project's source, instructions or other runs in its working directory. On the host it can still go looking; a container or remote sandbox keeps it out. Scenario definitions can be versioned in Git; reports and workspaces remain local and are **not automatically shared**. Review them for sensitive data before sharing.

## Explore more

- [Get started](sites/evalkit.leostera.dev/src/content/docs/index.md) and the [manual](sites/evalkit.leostera.dev/src/content/docs/manual/) explain adapters, datasets, scoring, reports, and the CLI. Upgrading from 0.5? See the [migration guide](CHANGELOG.md#migrating-from-05).
- [Interleaved scenario](examples/interleaved-scenario/) has a passing write/revise flow, an intentional failfast failure, and a provider-free fake judge agent.
- [Configured matrix](examples/configured-matrix/) shows a runnable parameter sweep without model credentials.
- [Judges](examples/judges/) grades a chat assistant with A/B/C and weighted-criteria judges and checks a built service with evidence-returning predicates, a stronger judge model chosen by the matrix, all provider-free.
- [Support suite](examples/support-suite/) is a few dozen short scenarios in three suites, sharing one agent, its judges, and static, computed and evaluator-only datasets.
- [HACKING.md](HACKING.md) covers the repository layout, builds, and tests for contributors.

EvalKit runs locally on Bun or Node 22.18+. Remote Agents SDK transport, enforced timeouts, and operation-wide safeguards for shared resources are not implemented. The root of this repository is the publishable `@leostera/evalkit` package.
