# EvalKit

**Find out whether your agent did the right thing—and see why.**

EvalKit lets you write agent evaluations as TypeScript: give an Agent Under Test (AUT) a scenario, inspect what it actually said and did, and score the result. Keep eval definitions in Git alongside your code; run them locally and inspect the evidence in a dashboard or ordinary report files.

- **Test the journey, not just the final answer.** Put `predicate(...)`, `judge(...)`, or `expectToolCall(...)` between user turns to check an intermediate reply, observed tool call, or live file state before continuing. `policy.failfast` can skip later turns after a failed checkpoint.
- **Choose how to score.** Run deterministic predicates without model credentials, or provide an independent judge agent for rubric-based verdicts. A judge can have its own tools; its events stay separate from the AUT trajectory. The same rule can run inline and in final scoring.
- **Make failures inspectable.** Reports record turns, checkpoints, skipped steps, final scores, and errors. Trials have isolated candidate and evaluator workspaces, so private expected answers need not be shown to the AUT.
- **Repeat and compare.** Run multiple trials or define a matrix of parameters. An adapter must explicitly apply those parameters to its AUT; EvalKit does not silently switch models.

## Try it locally

The provider-free starter runs without Pi, model credentials, or a Cloudflare account. It lives in this repository. A standalone `evalkit new` generator exists in the CLI, but **`@leostera/evalkit` has not been published yet**, so the `bunx` path is not available publicly.

```sh
git clone https://github.com/leostera/evalkit.git
cd evalkit
bun install
cd examples/starter
bun run greeting       # one trial of the provider-free greeting eval
bun run dashboard      # inspect the local report in a second terminal
```

The eval is a default-exported TypeScript file under `evals/`; no config or registry is needed for discovery:

```ts
// examples/starter/evals/greeting.eval.ts
import { defineEval, directory, user } from '@evalkit/core';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [directory('fixtures/starter')],
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
});
```

This example uses the repository's internal `@evalkit/*` workspace imports. When the consumer package is released, configure the GitHub Packages registry in `~/.npmrc` and set `GITHUB_PACKAGES_TOKEN` (with `read:packages`) **before** running `bunx @leostera/evalkit new my-evals`; then `cd my-evals && bun install && bun run evals`. The generated project imports from `@leostera/evalkit` and starts with a provider-free eval. **That `bunx` command is not available until the first package release**; `bunx github.com/leostera/evalkit new` does not target the packaged CLI in this monorepo.

Runs create `_evalkit-results/` and `_evalkit-sandbox/` in the example directory. Eval definitions can be versioned in Git; reports and workspaces remain local and are **not automatically shared**. Review them for sensitive data before sharing.

## Explore more

- [Get started](www/src/content/docs/index.md) and the [manual](www/src/content/docs/manual/) explain adapters, fixtures, scoring, reports, and the CLI.
- [Interleaved scenario](examples/interleaved-scenario/) has a passing write/revise flow, an intentional failfast failure, and a provider-free fake judge agent.
- [Configured matrix](examples/configured-matrix/) shows a runnable parameter sweep without model credentials.
- [HACKING.md](HACKING.md) covers the repository layout, builds, and tests for contributors.

EvalKit currently runs locally with Bun. Remote Agents SDK transport, enforced timeouts and cancellation, and operation-wide safeguards for shared resources are not implemented. The consumer package is prepared but has not been published; see its [installation and release status](packages/evalkit/README.md).
