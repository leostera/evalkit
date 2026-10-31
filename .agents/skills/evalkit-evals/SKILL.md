---
name: evalkit-evals
description: Define or modify EvalKit scenarios (evals) and suites. Use when adding prompts/transcripts, choosing datasets or scorers, configuring trial count, changing registry entries, or debugging unknown eval/suite IDs.
---

# Add a scenario or suite

Read `../evalkit/SKILL.md`, `../../../sites/evalkit.leostera.dev/src/content/docs/manual/project-structure.md` and `../../../sites/evalkit.leostera.dev/src/content/docs/manual/scoring-and-evals.md`, `../../../examples/starter/scenarios/greeting.eval.ts`, and `../../../examples/configured-matrix/evalkit.config.ts`.

1. Default-export one scenario per file from `scenarios/**/*.eval.ts` using `defineEval({ id: 'my-scenario', name, agent, transcript, scoring, datasets?, policy? })`. The CLI discovers these files automatically; no registry or config is required. Choose a stable lowercase kebab-case ID. `metadata` is optional; `name` is a display label. Import shared agents, judges and datasets; keep each scenario short and concrete (a suite of a hundred cases is a hundred files), and never generate scenarios in a loop.
2. Executable transcript steps are `user('message')`, inline `predicate(...)`, `judge(...)`, and `expectToolCall(...)`. User messages call `session.send` in order on one fresh session per trial; predicates/judges/tool-call assertions run at checkpoints. `judge(...)` requires a separate eval-level `judge` adapter. `agent(...)` transcript steps are not executable. `user(({ parameters, data, seed, trialIndex }) => ...)` computes a message per trial, so one scenario can vary its prompt by matrix axis or candidate dataset instead of being copied per variant; `policy.trials` controls independent trials (default 1, positive integer); `policy.timeoutMs` is not enforced.
3. Suites are directories: every file below `scenarios/billing/` is in suite `billing` (kebab-case directory names; deeper directories stay in the top one). Files directly in `scenarios/` have no suite; `discovery.suites: false` turns this off. Only use an explicit registry (`registry: registerEvals([defineSuite({ id, evals })])` in the config) when you need full control; it replaces discovery, and duplicate eval IDs throw.
4. For an intervention comparison, hold task/model/prompt constant and vary one explicit matrix axis (for example `memory: ['off', 'on']`). Repeat trials and include a negative control where possible. Record whether the treatment injects a saved memory or performs live retrieval: those answer different questions. A memory dataset can be evaluator-visible to the trusted adapter, but do not expose evaluator roots or reference answers to the AUT unless revealing the chosen treatment is intentional.
5. From the project directory run `bun run evalkit run <eval-id>`. Use `bun run evalkit run --suite <suite-id>` for a suite directory. IDs are exact human-defined strings. Inspect per-trial `scoring.json` and the run `summary.json`; completed execution is not the same as passing scores.
6. Update relevant tests and manual/examples if changing documented behavior. Run `bun run check`, inspect a `--dry-run`, and smoke-test one narrow scenario before a potentially costly Pi-backed matrix or suite.

For parameter sweeps, read `../evalkit-matrices/SKILL.md`. For scoring details, read `../evalkit-judges/SKILL.md`.

A scenario file that throws while importing (often a missing credential) becomes a load error for that file only; `run` refuses to run its scenarios unless `--skip-broken`. Do credentialed setup in the agent's `start()` or a dataset's `onLoad`, not at module top level.
