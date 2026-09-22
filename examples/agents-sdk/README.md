# Agents SDK eval example

This example will eventually configure a Cloudflare Agents SDK implementation as an Evalkit Agent Under Test (AUT).

The intended configuration shape is:

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
