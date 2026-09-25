# @leostera/evalkit

A single Bun package for writing and running agent evals. It contains the authoring API, a local runner, the `evalkit` command, and its dashboard. The monorepo's `@evalkit/*` packages are internal implementation modules; consumers install only `@leostera/evalkit`.

## Install from GitHub Packages

After the first package release, authenticate to GitHub's npm registry (including for public packages). Before using `bunx @leostera/evalkit new`, put this in your **user-level `~/.npmrc`** (or another npm config available in the directory where you invoke `bunx`). For an existing project, its `.npmrc` works too:

```ini
@leostera:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Set `GITHUB_PACKAGES_TOKEN` to a GitHub personal access token (classic) with `read:packages` permission. Never commit the token itself. Then run:

```sh
bun add @leostera/evalkit
```

The GitHub Actions workflow `.github/workflows/publish-package.yml` is **manual**; until it has been run, this package is not available from the registry. For local development, run `bun run --cwd packages/evalkit build` and `bun run --cwd packages/evalkit pack:check` from the monorepo root. The latter packs the real artifact, creates a standalone project with `evalkit new`, and runs the generated eval in isolation.

## Use

Once published, create a provider-free standalone EvalKit project with `bunx @leostera/evalkit new my-evals` (the GitHub Packages registry and token must be configured first). The command writes an eval, `.npmrc` using `GITHUB_PACKAGES_TOKEN`, and local run scripts; then `cd my-evals && bun install && bun run evals`. Until publication, the equivalent path is exercised by `bun run --cwd packages/evalkit pack:check` in this repository.

Alternatively, default-export an eval from `evals/greeting.eval.ts`:

```ts
import { defineEval, piAgent, predicate, user } from '@leostera/evalkit';

export default defineEval({
  id: 'greeting',
  agent: piAgent(),
  transcript: [user('Say hello')],
  scoring: [
    predicate('responds', ({ trajectory }) =>
      Number(
        trajectory.events.some(
          (event) => event.kind === 'message' && event.role === 'assistant',
        ),
      ),
    ),
  ],
});
```

This example needs an installed `pi` command and configured model access. You can instead implement a local AUT with `defineAgent(...)` (see [`examples/starter`](../../examples/starter/)). No registry or config is required for discovery. Run from the project directory:

```sh
bun run evalkit run-evals greeting --dry-run
bun run evalkit run-evals greeting --local --trials 1
bun run evalkit serve-dashboard
```

An optional `evalkit.config.ts` enables matrices, custom paths, and execution settings; see [`examples/configured-matrix`](../../examples/configured-matrix/). Low-level runner helpers are available from `@leostera/evalkit/runner`. Results and trial workspaces are local files, not automatically shared. `user(...)`, inline and final `predicate(...)` / `judge(...)` rules, and observed `expectToolCall(...)` checkpoints execute today; judge rules require a separate eval-level judge agent. The remote Agents SDK adapter is not implemented.
