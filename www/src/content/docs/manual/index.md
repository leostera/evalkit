---
title: Manual overview
description: How Evalkit's local authoring, execution, and reports fit together.
---

Evalkit is a local-first kit for **authoring agent evals as code**. Define tasks and scoring rules in TypeScript, review and version those definitions in Git, then run them against an **Agent Under Test (AUT)**. The AUT is the assistant, process, or service being measured; a scorer evaluates the evidence it produces. Evalkit does not automatically commit or share the resulting reports.

## The execution model

1. The CLI loads a project: by default, it discovers default-exported evals under `evals/`. Configuration or an explicit registry is optional.
2. An **eval** selects an AUT, an ordered transcript of user messages, optional fixtures, and scoring rules. An optional **suite** groups evals; a **matrix** expands evals across parameter choices.
3. A **run** of an eval contains one or more independent **trials**. Each trial gets fresh candidate and evaluator workspaces, materialized fixtures, and a new AUT session.
4. The runner sends each user message to the session, appends AUT and runner events to a **trajectory**, closes the session, then executes predicate scorers. The adapter must emit the AUT's response as an event; returning it from `send()` is not sufficient.
5. The runner writes a local report for the run and each trial. Execution status and scoring pass/fail are separate: a completed trial can have failing scores.

For a first provider-free run, use the [getting-started guide](/docs/) or the [zero-config starter](https://github.com/leostera/evalkit/tree/main/examples/starter). The [configured matrix example](https://github.com/leostera/evalkit/tree/main/examples/configured-matrix) sweeps local text styles without a model provider.

## Find the right chapter

- [Project structure and discovery](/docs/manual/project-structure/) — installation state, file matching, config precedence, IDs, and suites.
- [Agents under test](/docs/manual/agents/) — session lifecycle, event evidence, runtime selection, and the Pi adapter.
- [Fixtures](/docs/manual/fixtures/) — materializing per-trial inputs and separating candidate from evaluator data.
- [Scorers and evals](/docs/manual/scoring-and-evals/) — executable predicates, score semantics, partial failures, and a complete eval.
- [CLI and matrices](/docs/manual/cli-and-matrices/) — commands, selection, parameter forwarding, safety limits, and dashboard runs.
- [Results and reports](/docs/manual/results/) — v2 files, statuses, artifact snapshots, local dashboard, and CI checks.
- [Troubleshooting and limitations](/docs/manual/troubleshooting/) — common errors and declared APIs that are not executable yet.

## What works today

This manual describes the **local Bun CLI**. Only `user(...)` transcript steps and `predicate(...)` scorers execute. `agent(...)`/`judge(...)` transcript steps and `judgeScorer(...)` are API declarations, not working grading features. `policy.timeoutMs` is not enforced; `agentsSdk()` is not an implemented remote transport. There is no standalone project scaffolder. Parameter choices such as `model` and `maxTokens` only change an AUT if its adapter reads `context.parameters` and applies them. See [current limitations](/docs/manual/troubleshooting/#current-limitations).

Run the CLI from the eval project directory (or select a config with `--config`). The default report and retained-workspace directories are `_evalkit-results/` and `_evalkit-sandbox/` under that project. The definitions are suitable for Git; reports and workspaces are local evidence that you must explicitly archive or share. Both may contain sensitive data.
