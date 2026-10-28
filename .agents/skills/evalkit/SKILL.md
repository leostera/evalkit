---
name: evalkit
description: Work on or use this Evalkit repository end to end. Use for onboarding, choosing an Evalkit workflow, running evaluations, or coordinating changes across agents, fixtures, evals, scoring, matrices, and results.
---

# Evalkit (project guide)

This is a Bun workspace whose `new` CLI command generates standalone projects. `packages/evalkit` builds the single `@leostera/evalkit` artifact; the root `package.json` owns the npm name and manual publishing workflow. Check npm for the actual published version rather than assuming a release is live. The `@evalkit/*` packages are internal to the workspace. Read the Markdown guide `../../../sites/evalkit.leostera.dev/src/content/docs/index.md` and topic pages under `../../../sites/evalkit.leostera.dev/src/content/docs/manual/` for the user workflow; consult the implementation when behavior matters: `../../../packages/core/src/index.ts`, `../../../packages/runner/src/index.ts`, `../../../packages/cli/src/index.ts`, and `../../../examples/starter/` (paths relative to this skill directory). Check `git status --short` first and preserve unrelated changes.

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

- Work from the eval project's directory (for the included project, `examples/starter`). By default the CLI discovers default-exported `evals/*.eval.ts` without a config or registry. The starter demonstrates this zero-config discovery path; `examples/configured-matrix` demonstrates optional config and a runnable sweep. An optional `evalkit.config.js`/`.ts` customizes discovery and execution, or can supply an explicit registry/eval list. Fixture source paths and `_evalkit-results` / `_evalkit-sandbox` resolve relative to the config directory or project root.
- Authored suites, evals, agents, and matrices use stable lowercase kebab-case IDs. Fixtures have no IDs; destination conflicts are checked within each trial workspace. Only runs and trials receive generated runtime URIs.
- Keep evaluator fixtures/answers private from the AUT and model unless a trusted adapter deliberately reads them and includes selected content in its prompt. Such inclusion is a deliberate treatment (for example, a memory-on condition), not a live retrieval test. Local sandboxes retain evaluator files; review reports and sandboxes before sharing.
- Executable transcript steps are `user(...)`, `predicate(...)`, `judge(...)`, and `expectToolCall(...)`. Final scoring supports both `predicate(...)` and `judge(...)`; `judge(...)` requires a separate eval-level judge adapter. `agent(...)` transcript steps are not executable. `agentsSdk()` is unimplemented, `judgeScorer(...)` is not part of the current API, and `policy.timeoutMs` is not enforced. Verify current code/docs before proposing capabilities.
- The built-in `piAgent()` invokes Pi with `--no-tools`, once per user message, and does not preserve conversational state. It cannot test live MCP retrieval/tool use. For that, implement a custom AUT adapter that explicitly enables the desired tools and emits observed `tool-call`/`tool-result` events; do not claim a tool was used unless the adapter records it.
- For an intervention/A-B eval, hold task, model, and other settings constant; vary only the intervention parameter, use repeated trials and a negative control, and report exactly what was varied. A memory snapshot injected into the prompt tests memory-content usefulness, not retrieval quality. Start with a dry run and narrow smoke test; Pi-backed evaluations can incur provider costs.
- Run `bun run check` and relevant `bun test` suites when changing code. Check `git status --short` first and preserve unrelated changes.
