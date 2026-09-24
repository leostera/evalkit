---
title: Fixtures
description: Materialize candidate-visible inputs and private evaluator files for each trial.
---

Fixtures are inputs copied or created **before** the AUT session starts. Each trial gets two separate workspaces:

- **Candidate** (`context.workspace.root`, also `artifacts.candidate.root` in scorers): files the AUT can inspect or modify. The report snapshots these files at the end of the trial.
- **Evaluator** (`context.evaluatorWorkspace.root`, also `artifacts.evaluator.root` in scorers): private inputs for trusted adapters and predicates, such as expected answers. They are **not** copied into the report's candidate snapshot.

These are local directory conventions, **not** a security sandbox. A trusted adapter can read both; never pass evaluator paths or contents to an untrusted model. The CLI retains both workspaces under `_evalkit-sandbox/` for debugging, so keep that directory private too.

## Declare inputs

```ts
// evals/greeting.eval.ts — the array goes in defineEval({ fixtures: inputs, ... })
import { directory, file, inlineFile, dynamic } from '@evalkit/core';

const inputs = [
  // fixtures/my-case/ -> candidate/my-case/ (default destination and visibility)
  directory('fixtures/my-case'),
  // Explicit destination and visibility are required for file().
  file('fixtures/answer.txt', { dst: 'answer.txt', visibility: 'evaluator' }),
  inlineFile('instructions.txt', 'Summarize the input.', 'candidate'),
  dynamic(({ metadata, trialIndex }) =>
    inlineFile('seed.txt', `${metadata.randomSeed}:${trialIndex}`, 'candidate'),
  ),
];
```

| Helper                                   | Source and destination                                                                                               | Visibility                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `directory(src, { dst?, visibility? })`  | Copies a source directory recursively. `dst` defaults to the source basename (e.g. `fixtures/my-case` → `my-case`).  | Defaults to `candidate`.        |
| `file(src, { dst, visibility })`         | Copies one file to `dst`. Both options are required.                                                                 | Must be explicit.               |
| `inlineFile(path, contents, visibility)` | Writes the supplied string to `path`.                                                                                | Must be explicit.               |
| `dynamic(create)`                        | Runs a callback per trial; returns a fixture, an array, or a promise of either. May return further dynamic fixtures. | Set on the fixtures it returns. |

Fixture `src` values are filesystem paths resolved from the project directory. The CLI changes to that directory before running even when invoked with `--config` from elsewhere. `dst` and inline paths are relative to their visibility's workspace, not to the eval file or report root. Nested destinations such as `reference/answer.txt` are fine. A missing source fails fixture setup and the trial records a failed execution.

## Per-trial generation and isolation

The dynamic callback receives a `FixtureContext` with run/eval/trial IDs, zero-based `trialIndex`, `metadata` (including a newly generated numeric `randomSeed`), and any selected `parameters` or `runtime`. It runs before `agent.start()`, so you can derive **per-trial inputs from the seed**. Evalkit generates a new seed per trial and does not persist that seed automatically; if replay matters, record it deliberately in your own evidence. Supplying the same eval definition does not force the same seed on future runs. For a matrix cell, `parameters` contains the effective axis choices, defaults, and overrides.

Each trial has a distinct workspace and new copies of its fixtures; edits made in one trial do not become another trial's starting state. The CLI uses `_evalkit-sandbox/<trial-uuid>/{candidate,evaluator}/` and **retains** it after the run, including evaluator files. A low-level `runEval(...)` call without a persistent `workspaceRoot` uses an OS temporary workspace that is removed after execution.

## Destination rules and report safety

Destinations must be nonempty, relative paths that do not escape their workspace (`..` or an absolute path is rejected). Two fixtures cannot use the **same destination within the same visibility** in one trial; the same destination in separate evals or one candidate and one evaluator workspace is permitted. Avoid overlapping parent/child destinations too, since filesystem copies can conflict. Recursive dynamic fixture expansion has a depth limit. Fixtures are materialized before any user transcript message is sent.

At trial end, Evalkit copies **regular files** from the candidate workspace to `trials/<trial-id>/artifacts/candidate/`, listing files/directories in the trial summary. The snapshot is post-execution, not a separate copy of the original fixtures. Symbolic links and unsupported filesystem entries in the candidate tree cause snapshot failure rather than being followed. Evaluator files are excluded from this snapshot, but their contents can still leak if your adapter emits them in events or writes them into the candidate workspace. Reports may contain prompts, answers, and user data; [review retention and sharing](/docs/manual/results/#privacy-and-retention) before archiving them.
