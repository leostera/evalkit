---
title: Scorers and evals
description: Write reusable predicate scorers and default-export eval definitions.
---

A predicate receives the full event trajectory plus candidate/evaluator artifact roots. Return a number in `[0, 1]` (only `1` passes by default), or an object with an explicit `passed`, `explanation`, and optional JSON `evidence`:

```ts
// judges/my-judges.ts
import { predicate } from '@evalkit/core';

export const repliesPolitely = predicate(
  'replies politely',
  ({ trajectory }) => {
    const replies = trajectory.events.filter(
      (event) =>
        event.source === 'aut' &&
        event.kind === 'message' &&
        event.role === 'assistant',
    );
    const last = replies.at(-1);
    const passed =
      last?.kind === 'message' &&
      typeof last.content === 'string' &&
      last.content.includes('Hello');
    return {
      value: passed ? 1 : 0,
      passed,
      explanation: 'Expected a greeting.',
    };
  },
);
```

```ts
// evals/my-eval.eval.ts
import { defineEval, user } from '@evalkit/core';
import { myAgent } from '../agents/my-agent.js';
import { repliesPolitely } from '../judges/my-judges.js';

export const myEval = defineEval({
  id: 'polite-greeting',
  name: 'Polite greeting',
  agent: myAgent,
  transcript: [user('Ada')],
  scoring: [repliesPolitely],
  policy: { trials: 3 },
});

export default myEval;
```

Add `fixtures: inputs` if needed. The default export makes the eval discoverable; you only import it into a registry when deliberately defining an explicit suite. Every `user(...)` step calls `session.send(...)` in order on the same session; the runner replaces `{{randomSeed}}` in messages with a newly generated seed per trial. Each trial starts a fresh session and workspace. Scorers run **after** the session closes. Use `artifacts.candidate.root` and `artifacts.evaluator.root` inside a scorer to read files (for example with `node:fs/promises`); `trajectory.events` contains `source: 'aut'` and `source: 'runner'` events. If execution fails, normal scorers are skipped; `predicate(name, fn, { supportsPartial: true })` can score the partial trajectory when a context/workspace exists. A scorer exception is recorded as a failed scorer, not as a successful score.
