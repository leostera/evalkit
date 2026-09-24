---
name: evalkit-evals
description: Define, register, or modify Evalkit evaluations and suites. Use when adding prompts/transcripts, choosing fixtures or scorers, configuring trial count, changing registry entries, or debugging unknown eval/suite IDs.
---

# Add an eval or suite

Read `../evalkit/SKILL.md`, `../../../www/src/content/manual.md` (Project structure and Add a scorer and an eval), `../../../examples/starter/evals/greeting.eval.ts`, and `../../../examples/starter/src/registry.ts`.

1. Define an eval in `evals/*.eval.ts` with `defineEval({ id: 'my-eval', name, agent, transcript, scoring, fixtures?, policy? })`. Choose a stable lowercase kebab-case ID. `metadata` is optional; `name` is a display label. Reuse existing agents/scorers/fixtures where appropriate.
2. Today, use only `user('message')` transcript steps. These call `session.send` in order on one session. `{{randomSeed}}` is replaced per trial; a fresh agent session and workspace are created for each trial. `agent(...)` and `judge(...)` transcript steps are _not executable_. `policy.trials` controls the number of independent trials (default 1, positive integer); `policy.timeoutMs` is not enforced.
3. Add the eval to the **default export** of `src/registry.ts`: `registerEvals([myEval])` for a standalone eval, or put it in `defineSuite({ id: 'my-suite', name, evals: [myEval] })`. Do not also register a suite's eval standalone: duplicate eval IDs throw. Alternatively, default-export an eval from `evals/*.eval.ts` for CLI discovery. Use distinct IDs for authored resources.
4. From the project directory run `bun run evalkit run-evals <eval-id>` or `bun run evalkit run-suite <suite-id>`. IDs are exact human-defined strings. Inspect trial `scoring.json` and run `summary.json` for outcome, not just the CLI status text.
5. Update relevant tests and manual/examples if changing documented behavior. Run `bun run check` and a focused test/smoke run; avoid running every Pi-backed eval unnecessarily.

For parameter sweeps, read `../evalkit-matrices/SKILL.md`. For scoring details, read `../evalkit-judges/SKILL.md`.
