# Agents SDK transport (planned example)

**Not runnable yet.** `agentsSdk(...)` currently throws `Agents SDK transport is not implemented yet` when called. This directory does not contain discoverable `evals/*.eval.ts` files or a `src/registry.ts`, so do not run the Evalkit CLI here expecting an eval.

When the transport exists, an eval could default-export a definition like this from `evals/support.eval.ts` (the shape below is illustrative, **not** a working integration):

```ts
import { defineEval, user } from '@evalkit/core';
import { agentsSdk } from '@evalkit/agents';

export default defineEval({
  id: 'support-agent',
  agent: agentsSdk({
    endpoint: 'http://localhost:8787',
    agent: 'SupportAgent',
  }),
  transcript: [user('Hello')],
  scoring: [],
});
```

No registry or config would be needed for a single eval: the CLI discovers default exports from `evals/*.eval.ts`. Until this transport is implemented, use the runnable [`starter`](../starter/) for a local AUT or [`configured-matrix`](../configured-matrix/) for parameter sweeps.
