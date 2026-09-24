---
title: Fixtures
description: Create candidate-visible and private evaluator inputs for each trial.
---

Fixtures materialize **before** the agent starts. Paths in `src` are relative to the CLI working directory; destinations are relative to their respective trial workspace. Each trial has separate `candidate` (visible to the agent) and `evaluator` (private to trusted code/scorers) directories. Explicitly keep answers, secrets, and gold-standard data in the evaluator workspace, not the candidate workspace.

```ts
import { directory, file, inlineFile, dynamic } from '@evalkit/core';

const inputs = [
  // Copies fixtures/my-case/ to candidate/my-case/ by default.
  directory('fixtures/my-case'),
  file(
    'fixtures/answer.txt',
    {
      dst: 'answer.txt',
      visibility: 'evaluator',
    },
  ),
  inlineFile(
    'instructions.txt',
    'Summarize the input.',
    'candidate',
  ),
  dynamic((context) =>
    inlineFile(
      'seed.txt',
      String(context.metadata.randomSeed),
      'candidate',
    ),
  ),
];
```

`directory(src, { dst?, visibility? })` defaults to the source basename and candidate visibility. `file(src, { dst, visibility })` and `inlineFile(path, contents, visibility)` require explicit visibility. `dynamic(create)` can return one fixture or an array (and may be async); use it to generate per-trial inputs. No fixture ID is required; repeating the same destination in different evals is fine. Destinations must be relative, cannot escape the workspace, and cannot duplicate another fixture's destination within the same visibility. Candidate files at the end of a trial are copied into the report; evaluator files are **not** included in that snapshot. Local sandbox directories, however, retain **both** workspaces, so treat them as sensitive.
