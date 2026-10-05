# EvalKit package build workspace

This private workspace compiles the **root** `@leostera/evalkit` package. It is not an independently installable or published package. The root `package.json` supplies the public `bin` and exports; `bun run build` at the repository root copies the compiled CLI, API, types, and dashboard into the git-ignored root `dist/` for npm packaging.

For user setup, see the [root README](../../README.md). For build and test instructions, see [HACKING.md](../../HACKING.md). The manual npm publishing workflow publishes the **root package**. Run `bunx @leostera/evalkit new ./evals` to try the published CLI.
