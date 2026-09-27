---
name: evalkit-fixtures
description: Add or troubleshoot Evalkit input fixtures and trial workspaces. Use for directory/file/inline/dynamic fixtures, per-trial data, candidate/evaluator visibility, or fixture path failures.
---

# Add Evalkit fixtures

Read `../evalkit/SKILL.md` and `../../../www/src/content/docs/manual/fixtures.md`. Check `../../../packages/core/src/index.ts` fixture helpers and `../../../packages/runner/src/workspace.ts` for current behavior.

1. Store inputs under the eval project (e.g. `examples/starter/fixtures/`). Source paths are resolved from the **invoking working directory**, not relative to the eval file. Register fixtures in the eval's `fixtures` array.
2. Fixtures do not need IDs. Choose visibility deliberately: `candidate` files may be read by the agent/model and are snapshotted into reports; `evaluator` files are private to trusted adapter/scorer code, but still remain in local `_evalkit-sandbox/`.
3. Use `directory(src, { dst?, visibility? })` to copy a tree; default destination is its basename and default visibility is candidate. Use `file(src, { dst, visibility })` for a file; `inlineFile(relativePath, text, visibility)` for generated text; `dynamic(context => fixture | fixture[])` for per-trial generated inputs (async is allowed). Dynamic fixture context includes `trialIndex`, `metadata.randomSeed`, and optional `parameters`.
4. Destination paths must be nonempty relative paths within a workspace. Avoid collisions **within each visibility**, including those created by dynamic fixtures. Check they are actual files/directories before launching expensive agents.
5. For a file-creating agent, inspect candidate files via `artifacts.candidate.root` in predicates and the report's `trials/<trial-id>/artifacts/candidate/`. Inspect evaluator files locally under `_evalkit-sandbox/<trial-id>/evaluator/` only when authorized. Don't put secrets or gold answers into candidate fixtures, event content, or shared reports.

When fixture materialization fails, look for a runner `error` in `trajectory.jsonl` and trial `summary.json`. Test the smallest registered eval from the project directory.
