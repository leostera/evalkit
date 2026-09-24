---
title: Agents under test
description: Connect an Agent Under Test and record its events.
---

The **Agent Under Test (AUT)** is the system you want to evaluate—not the scorer. It might be your assistant, a local process, or a service. An adapter bridges that system to Evalkit: each trial gets a fresh session, receives the eval's user messages, and emits a trajectory of events. After the session closes, scorers inspect those events and the trial's files.

The adapter implements `start`, returning a session with `send` and `close`. `send` must resolve when that turn is finished; returning an answer from `send` alone does **not** put it in the trajectory. Emit normalized assistant message events for scoring and the dashboard; `content` must be JSON-serializable. For example:

```ts
import { defineAgent } from '@evalkit/core';

export const myAgent = defineAgent({
  identity: {
    name: 'My agent',
    kind: 'local',
    id: 'my-agent',
    version: '1',
  },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context, onEvent }) {
    // context.workspace.root is the candidate-visible directory for this trial.
    // Never pass context.evaluatorWorkspace.root to the model.
    let turn = 0;
    await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
    return {
      async send(message: string) {
        turn++;
        await onEvent({
          kind: 'turn-started',
          turn,
          timestamp: new Date().toISOString(),
        });
        const answer = `Hello, ${message}`; // Replace with your agent call.
        await onEvent({
          kind: 'message',
          role: 'assistant',
          content: answer,
          timestamp: new Date().toISOString(),
        });
        await onEvent({
          kind: 'turn-completed',
          turn,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {
        await onEvent({
          kind: 'completed',
          timestamp: new Date().toISOString(),
        });
      },
    };
  },
});
```

`context` also supplies run/eval/trial IDs, zero-based `trialIndex`, `metadata` (including a per-trial `randomSeed`), and optional `parameters` and `runtime`. For an external service, implement the same adapter contract and isolate sessions by trial. The built-in `piAgent()` from `@evalkit/agents` runs the local `pi --print --no-session --no-tools` process once per message in the candidate workspace; see [`examples/starter/agents/pi-agent.ts`](https://github.com/leostera/evalkit/blob/main/examples/starter/agents/pi-agent.ts). It does not maintain a Pi conversation across messages. The `agentsSdk()` remote adapter currently throws “not implemented yet.”
