# Hacking on EvalKit

This is the repository development guide. If you just want to run an eval, start with the [README](README.md) or [Get started](www/src/content/docs/index.md).

## Set up

Install [Bun](https://bun.sh/), then from the repository root:

```sh
bun install
bun run check
bun test
bun run build
bun run --cwd packages/evalkit pack:check
bun run --cwd www build
```

The pack check builds and exercises the installable artifact in an isolated local project; it does **not** publish it. Website builds do **not** deploy the Worker. To try a provider-free eval, run `bun run greeting` from `examples/starter/`. Run `bun run dashboard` there in a second terminal to inspect its reports.

## Where things live

| Path | Purpose |
| --- | --- |
| `packages/core` | Authored evals, agents, rules, trajectories, and report contracts |
| `packages/runner` | Local execution, isolated workspaces, and report storage |
| `packages/agents` | Local Pi adapter and planned (not implemented) Agents SDK transport |
| `packages/cli` | CLI implementation and dashboard server |
| `packages/dashboard` | Dashboard frontend |
| `packages/evalkit` | Prepared single consumer package `@leostera/evalkit`, including CLI and dashboard |
| `examples/starter` | Zero-config discovery and provider-free greeting eval, plus Pi-backed evals |
| `examples/configured-matrix` | Provider-free parameter sweep |
| `examples/interleaved-scenario` | Provider-free checkpoints, failfast, and judge-agent examples |
| `examples/agents-sdk` | Planned remote transport example; not runnable yet |
| `www` | Astro website built as Workers Static Assets |
| `docs/rfds` | Design records and proposals |

The examples use private workspace packages (`@evalkit/*`). The intended external package is `@leostera/evalkit`, **not yet published**. The CLI includes `evalkit new <directory>` for generating a standalone project; `bun run --cwd packages/evalkit pack:check` exercises that command against the locally packed package. The public `bunx @leostera/evalkit new` path needs the first package release. `examples/starter` is part of the monorepo rather than a standalone template.

## Working on evals and reports

Run CLI commands **from the example or eval project directory**: discovery, fixture paths, `_evalkit-results/`, and `_evalkit-sandbox/` are project-relative. The starter's `bun run greeting` does not require a provider; `bun run evals` also runs Pi-backed evals and requires a configured model. The interleaved example's `bun run failfast` intentionally fails and exits nonzero.

`bun test` covers core contracts, runner reports, CLI/dashboard integration, and examples. Check the [manual](www/src/content/docs/manual/) when changing authoring APIs or report semantics, and update its source pages along with examples. Treat reports, judge observations, and evaluator workspaces as potentially sensitive; don't commit local runs or secrets.

Package publication uses a manual GitHub Actions workflow. Workers deployment is separate and must be explicitly requested; building or dry-running Wrangler doesn't deploy the website.
