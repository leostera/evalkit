---
name: evalkit
description: Work on or use this Evalkit repository end to end. Use for onboarding, choosing an Evalkit workflow, running evaluations, or coordinating changes across agents, fixtures, evals, scoring, matrices, and results.
---

# Evalkit (project guide)

This is a Bun workspace, not a published/scaffolded product. Read `../../../www/src/content/manual.md` for the user workflow; consult the implementation when behavior matters: `../../../packages/core/src/index.ts`, `../../../packages/runner/src/index.ts`, `../../../packages/cli/src/index.ts`, and `../../../examples/starter/` (paths relative to this skill directory). Check `git status --short` first and preserve unrelated changes.

## Route the task

Each sibling directory is a separately discoverable skill. Read its `SKILL.md` when relevant (resolve paths relative to this skill directory):

- `../evalkit-agents/SKILL.md` — add or change an Agent Under Test (AUT) adapter.
- `../evalkit-fixtures/SKILL.md` — prepare candidate/evaluator input files and per-trial workspaces.
- `../evalkit-evals/SKILL.md` — author transcripts, policies, registries, and suites.
- `../evalkit-judges/SKILL.md` — write executable predicate scorers and evaluate outcomes.
- `../evalkit-matrices/SKILL.md` — parameter sweeps and matrix registration.
- `../evalkit-results/SKILL.md` — run the CLI/dashboard, inspect reports, analyze failures and CI checks.

For a cross-cutting change, use all relevant subskills; for a focused task, load just that subskill. If code and docs disagree, verify the current code and update the manual/skills as appropriate.

## Invariants

- Work from the eval project's directory (for the included project, `examples/starter`). The starter uses an explicit `src/registry.ts`; config-based projects load `evalkit.config.js`/`.ts` and discover default-exported `evals/*.eval.ts` unless a registry/eval list is supplied. Fixture source paths and `_evalkit-results` / `_evalkit-sandbox` resolve relative to the project config.
- Authored suites, evals, agents, and matrices use stable lowercase kebab-case IDs. Fixtures have no IDs; destination conflicts are checked within each trial workspace. Only runs and trials receive generated runtime URIs.
- Keep evaluator fixtures/answers private from the agent and model. Local sandboxes retain evaluator files: review before sharing.
- Only `user(...)` transcript steps and `predicate(...)` scorers execute today. `agentsSdk()` remote transport, `judgeScorer(...)`, `agent(...)`/`judge(...)` steps, and enforced `policy.timeoutMs` are not available. Do not suggest them as a working solution.
- Prefer a narrow greeting eval run for a smoke test before running all registered Pi-backed evals, which may incur provider costs. Run `bun run check` and relevant `bun test` suites when changing code.
