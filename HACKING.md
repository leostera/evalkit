# Hacking on EvalKit

This is the repository development guide. If you just want to run an eval, start with the [README](README.md) or [Get started](www/src/content/docs/index.md).

## Set up

Install [Bun](https://bun.sh/), then from the repository root:

```sh
bun install
bun run check
bun test
bun run build
bun run pack:check
bun run --cwd www build
```

The pack check builds and exercises the installable artifact in an isolated local project; it does **not** publish it. Website builds do **not** deploy the Worker. To try a provider-free eval, run `bun run greeting` from `examples/starter/`. Run `bun run dashboard` there in a second terminal to inspect its reports.

## Where things live

| Path                            | Purpose                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/core`                 | Authored evals, agents, rules, trajectories, and report contracts                        |
| `packages/runner`               | Local execution, isolated workspaces, and report storage                                 |
| `packages/agents`               | Local Pi adapter and planned (not implemented) Agents SDK transport                      |
| `packages/cli`                  | CLI implementation and dashboard server                                                  |
| `packages/dashboard`            | Dashboard frontend                                                                       |
| `package.json` and `dist/`      | Git-installable public `@leostera/evalkit` package, with compiled CLI, API and dashboard |
| `packages/evalkit`              | Private build workspace for the root package artifact                                    |
| `examples/starter`              | Zero-config discovery and provider-free greeting eval, plus Pi-backed evals              |
| `examples/configured-matrix`    | Provider-free parameter sweep                                                            |
| `examples/interleaved-scenario` | Provider-free checkpoints, failfast, and judge-agent examples                            |
| `examples/agents-sdk`           | Planned remote transport example; not runnable yet                                       |
| `www`                           | Astro website built as Workers Static Assets                                             |
| `docs/rfds`                     | Design records and proposals                                                             |

The examples use internal workspace packages (`@evalkit/*`). External projects import `@leostera/evalkit` directly from this public Git repository; no npm release is required. `bun run build` compiles the private build workspace and syncs its output into the **tracked root `dist/`**. Keep that artifact current when changing public APIs or the CLI: Git installations do not rely on install-time build scripts. `bun run pack:check` exercises the root package in isolation, including the generated project, its matrix, and type-checking. The authored scaffold lives in `packages/cli/src/new-project.ts`; rebuild and commit root `dist/` whenever you change it. The standalone `bunx https://github.com/leostera/evalkit.git new ./evals` path is the user-facing entry point.

## Working on evals and reports

Run CLI commands **from the example or eval project directory**: discovery, fixture paths, `_evalkit-results/`, and `_evalkit-sandbox/` are project-relative. The starter's `bun run greeting` does not require a provider; `bun run evals` also runs Pi-backed evals and requires a configured model. The interleaved example's `bun run failfast` intentionally fails and exits nonzero.

`bun test` covers core contracts, runner reports, CLI/dashboard integration, and examples. Check the [manual](www/src/content/docs/manual/) when changing authoring APIs or report semantics, and update its source pages along with examples. Treat reports, judge observations, and evaluator workspaces as potentially sensitive; don't commit local runs or secrets.

Package publication uses a manual GitHub Actions workflow. Workers deployment is separate and must be explicitly requested; building or dry-running Wrangler doesn't deploy the website.
