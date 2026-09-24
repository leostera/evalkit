---
title: Manual overview
description: Concepts, project roots, and the runnable examples.
---

Evalkit is a kit for authoring agent evals as code. Keep TypeScript eval definitions in Git so your team can review and version them, reuse input fixtures and executable predicate judges across tasks, and run parameter matrices to compare model settings. Each run writes local reports you can inspect, compare, or deliberately archive; results are not automatically committed or shared. An eval combines an **Agent Under Test (AUT)**—the assistant, service, or program being measured—with user messages, optional fixture files, and scoring rules. Evalkit talks to the AUT through an adapter, records what it does, then applies scorers to that evidence. A **run** contains one or more independent **trials**; each trial gets its own workspace and event trajectory.

> **Current scope:** This manual describes the local Bun CLI in this repository. There is no dedicated standalone Evalkit project scaffold or remote Agents SDK transport yet; `bun create` simply copies this repository. Only `user(...)` transcript steps and `predicate(...)` scorers execute today; `agent(...)`/`judge(...)` steps and `judgeScorer(...)` are defined in the API but are not runnable. `policy.timeoutMs` is declared but not enforced. See [Current limitations](/docs/manual/troubleshooting/).

New to Evalkit? Follow the [getting-started guide](/docs/) for the first run, starter project, and local dashboard. Use the pages in the sidebar for the detailed contracts behind each step.

The CLI uses **the current working directory** as the project root. By default it discovers default-exported `evals/**/*.eval.ts`/`.js` files. An optional `evalkit.config.js`/`.ts`/`.mjs` customizes the project; a `src/registry.ts` is only needed for an explicit registry or suite. It resolves fixture sources relative to this directory and writes `_evalkit-results/` and `_evalkit-sandbox/` here. Run commands from the eval project directory, not the monorepo root. Set `EVALKIT_NO_OPEN=1` to suppress automatic browser opening or `PORT=4318` to choose another dashboard port.

Explore the runnable zero-config [starter](https://github.com/leostera/evalkit/blob/main/examples/starter/README.md): [`agents/greeting-agent.ts`](https://github.com/leostera/evalkit/blob/main/examples/starter/agents/greeting-agent.ts), [`evals/greeting.eval.ts`](https://github.com/leostera/evalkit/blob/main/examples/starter/evals/greeting.eval.ts), and [`judges/greeting.ts`](https://github.com/leostera/evalkit/blob/main/examples/starter/judges/greeting.ts). For a real `evalkit.config.ts` and lazy parameter sweep, see [configured-matrix](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/README.md).
