---
title: Manual overview
description: How EvalKit's scenarios, agents, sandboxes, scoring and results fit together.
---

EvalKit tests AI agents the way you test code. You write **scenarios** in TypeScript, run an **Agent Under Test (AUT)** through them (a coding agent such as Pi, Codex, opencode or Claude Code, or your own service), and **score** every run with checks and judges. Each run keeps its transcript, scores, logs and the files the agent left, so you can see why it passed or failed. EvalKit never calls a model provider; your agent does.

## How a run works

1. **The CLI loads the project.** It discovers default-exported scenarios under `scenarios/`; each directory below it is a suite. `evalkit.config.ts` adds a matrix, limits, sandboxes, fixtures and a default judge.
2. **A scenario** (`defineEval`) names an agent, a transcript of user messages with optional **checkpoints** between them, optional **datasets**, and final scoring rules. A **matrix** runs scenarios across parameter choices, such as models; `repeat: n` starts `n` runs of each as one **batch**.
3. **A run** is one execution of one scenario in one **sandbox**: this machine, a container, or a remote machine you provide. It gets a fresh candidate workspace with its datasets' files, a separate evaluator workspace for expected answers, and a new session of the agent.
4. **The runner drives the conversation.** It sends each user message, checks each checkpoint against the completed turn and the workspace, and records everything the agent did as an [ATXF](https://atxf.leostera.dev) **transcript**. Limits on steps, tokens and time stop a run that goes too far.
5. **Scoring** runs predicates (checks in code) and judges (a rubric, answered by a judge agent) over the transcript, the files and the datasets. Each verdict keeps its explanation and evidence.
6. **Each run is saved** with one status: `passed`, `failed` (it finished, but a score did not pass), `errored` (it could not finish), `limited` (it hit a limit) or `cancelled`. `evalkit dev` shows it; `evalkit share` and `evalkit build` publish it.

For a first run that needs no model key, follow [Get started](/docs/). Each [example](https://github.com/leostera/evalkit/tree/main/examples) runs without a provider: `starter` is the generated project, `configured-matrix` a parameter sweep, `interleaved-scenario` checkpoints that pass and fail, `judges` a model sweep scored by judges, and `support-suite` suites, datasets and tool calls.

## Find the right chapter

- [Project structure and discovery](/docs/manual/project-structure/): installing, file discovery, the config file, IDs and suites.
- [Agents under test](/docs/manual/agents/): adapters and sessions, coding-agent harnesses, transcripts, limits, sandboxes and fixtures.
- [Datasets](/docs/manual/datasets/): files and values for scenarios, computed inputs, and keeping expected answers from the agent.
- [Scorers and evals](/docs/manual/scoring-and-evals/): checkpoints, predicates, judges with choices or criteria, pass marks and partial runs.
- [CLI and matrices](/docs/manual/cli-and-matrices/): commands, matrices and selection, CI, `compare`, the dashboard, sharing, `tidy` and `upgrade`.
- [Results and reports](/docs/manual/results/): the files a run leaves, statuses, workspace snapshots, and running from code.
- [Troubleshooting](/docs/manual/troubleshooting/): common errors and what is not available yet.

## Where things live

Run the CLI from the eval project's directory, or point it at a config with `--config`. It runs on Bun, or Node 22.18 or later. Results go to `_evalkit-results/` in the project; run workspaces go to `$TMPDIR/evalkit/<project>-<hash>/`, outside it. Keep the definitions in Git. Results and workspaces stay on your machine until you share them, and may contain sensitive data: transcripts, files, and the evaluator's expected answers in kept workspaces.
