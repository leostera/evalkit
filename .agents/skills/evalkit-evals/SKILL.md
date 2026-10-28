---
name: evalkit-evals
description: Define, register, or modify Evalkit evaluations and suites. Use when adding prompts/transcripts, choosing fixtures or scorers, configuring trial count, changing registry entries, or debugging unknown eval/suite IDs.
---

# Add an eval or suite

Read `../evalkit/SKILL.md`, `../../../sites/evalkit.leostera.dev/src/content/docs/manual/project-structure.md` and `../../../sites/evalkit.leostera.dev/src/content/docs/manual/scoring-and-evals.md`, `../../../examples/starter/evals/greeting.eval.ts`, and `../../../examples/configured-matrix/evalkit.config.ts`.

1. Default-export an eval from `evals/*.eval.ts` using `defineEval({ id: 'my-eval', name, agent, transcript, scoring, fixtures?, policy? })`. The CLI discovers these files automatically; no `src/registry.ts` or config is required. Choose a stable lowercase kebab-case ID. `metadata` is optional; `name` is a display label. Reuse existing agents/scorers/fixtures where appropriate.
2. Executable transcript steps are `user('message')`, inline `predicate(...)`, `judge(...)`, and `expectToolCall(...)`. User messages call `session.send` in order on one fresh session per trial; predicates/judges/tool-call assertions run at checkpoints. `judge(...)` requires a separate eval-level `judge` adapter. `agent(...)` transcript steps are not executable. `{{randomSeed}}` is replaced per trial; `policy.trials` controls independent trials (default 1, positive integer); `policy.timeoutMs` is not enforced.
3. If you need an explicit suite, use `registerEvals([defineSuite({ id: 'my-suite', name, evals: [myEval] })])` from `src/registry.ts` (without a config) or supply that registry in `evalkit.config.js`. Do not register its evals separately: duplicate eval IDs throw. A config with no `registry`/`evals` still discovers default exports. Only suites, evals, agents, and matrices have authored IDs; fixtures are scoped by destination.
4. For an intervention comparison, hold task/model/prompt constant and vary one explicit matrix axis (for example `memory: ['off', 'on']`). Repeat trials and include a negative control where possible. Record whether the treatment injects a saved memory or performs live retrieval: those answer different questions. A memory fixture can be evaluator-visible to the trusted adapter, but do not expose evaluator roots or reference answers to the AUT unless revealing the chosen treatment is intentional.
5. From the project directory run `bun run evalkit run <eval-id>`. Use `bun run evalkit run --suite <suite-id>` only if you defined a suite explicitly. IDs are exact human-defined strings. Inspect per-trial `scoring.json` and the run `summary.json`; completed execution is not the same as passing scores.
6. Update relevant tests and manual/examples if changing documented behavior. Run `bun run check`, inspect a `--dry-run`, and smoke-test one narrow eval before a potentially costly Pi-backed matrix or suite.

For parameter sweeps, read `../evalkit-matrices/SKILL.md`. For scoring details, read `../evalkit-judges/SKILL.md`.
