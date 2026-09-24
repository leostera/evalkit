---
title: Agents under test
description: Connect an AUT, implement a trial session, and emit scoreable evidence.
---

The **Agent Under Test (AUT)** is the assistant, process, or service you want to measure. A _scorer_ decides whether its behavior was good; it is not the AUT. Evalkit knows only the adapter you provide, not your provider's chat or tool API. Each trial materializes its fixtures, then calls `agent.start(...)` to create a fresh session. The runner passes `user(...)` messages to `session.send(message)` in order, calls `session.close()`, and scores the recorded events and files.

## Implement an adapter

An adapter has an optional display `identity`, optional runtime declarations, and `start({ context, runtime?, onEvent })`. The session implements asynchronous `send(message)` and `close()`. **`send()` resolves when the turn is done; its return value is ignored.** Emit a JSON-serializable assistant `message` event through `onEvent` if a scorer should see the answer.

```ts
// agents/greeting-agent.ts — local, provider-free example
import { defineAgent } from '@evalkit/core';

export const greetingAgent = defineAgent({
  identity: {
    kind: 'in-process',
    id: 'greeting-agent',
    name: 'Greeting agent',
  },
  runtimes: { local: { kind: 'in-process' } },
  async start({ onEvent }) {
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
        await onEvent({
          kind: 'message',
          role: 'assistant',
          content: `Hello, ${message}`,
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

The adapter owns the actual agent invocation and session isolation. For a multi-message conversation, keep conversation state in this per-trial session; Evalkit does not reconstruct it from events for you. Emit the **actual** tool calls, tool results, messages, and usage your integration observes, rather than claiming tool activity that did not happen.

### Trial context and runtime

`context` provides `runId`, `evalId`, `trialId`, zero-based `trialIndex`, `metadata` (including a fresh numeric `randomSeed`), `workspace.root` for candidate-visible files, `evaluatorWorkspace.root` for trusted evaluator data, and optional `parameters` and `runtime`. `{{randomSeed}}` in a `user(...)` message is replaced before `send()` is called. Never put the evaluator workspace path or contents into a model prompt; trusted adapters have access to it, so enforce this boundary yourself.

`runtimes` advertises supported names (`local`, `remote`, `sandbox`) with `{ kind, configuration? }` metadata. A selected runtime is passed to `start()` both as `context.runtime` (its name) and as `runtime` (the declared object). The adapter interprets the declaration; merely declaring `remote` or `sandbox` does not provide a transport or isolation. A run requesting an undeclared runtime fails. Without an explicit choice, a direct runner call passes no selected runtime; CLI matrix execution chooses the first declared runtime in `local`, `remote`, `sandbox` order. `--local` explicitly requests `local`.

Matrix axis values and CLI flags such as `--max-tokens` appear in `context.parameters`; Evalkit does **not** map them to provider settings. If your adapter offers model selection, read (and validate) `context.parameters?.model` and use it when invoking your provider. The [configured-matrix example](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/agents/case-agent.ts) shows this with a provider-free `style` axis.

## Events and the recorded trajectory

Call and await `onEvent` to append evidence in emission order. AUT events get `source: 'aut'`; the runner also records `source: 'runner'` events for trial and step starts/completions, scorer activity, and errors. Scorers receive both in `trajectory.events`, and reports store them as JSON Lines in `trajectory.jsonl`.

| AUT event `kind`                 | Notable fields                                                              | When to emit                                              |
| -------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `started`, `completed`, `error`  | `timestamp`; optional JSON `output` on completed, recorded error on error   | AUT lifecycle or AUT-reported error.                      |
| `message`                        | `role` (`system`, `user`, `assistant`, `tool`), JSON `content`, `timestamp` | An observed message. Emit assistant responses explicitly. |
| `tool-call`, `tool-result`       | Shared call `id`, tool `name`, JSON arguments/result, `timestamp`           | Actual tool activity.                                     |
| `turn-started`, `turn-completed` | Turn number; optional `latencyMs` and token `usage` on completion           | A turn boundary and any measured usage.                   |

Timestamps are ISO strings supplied by your adapter. Any turn-completion usage or latency you emit is available in the trajectory; Evalkit does not infer provider tokens or latency from message text. If `start()`, `send()`, or `close()` throws, the runner records an error, closes an opened session, and normally skips scoring except [partial-support predicates](/docs/manual/scoring-and-evals/#partial-execution-and-errors). `close()` should release resources even after an unsuccessful turn.

## Built-in and custom integrations

`piAgent({ command?, args? })` (from `@evalkit/agents` inside this monorepo, or `@leostera/evalkit` after publication) invokes the local `pi` command in the candidate workspace. For **each** `send()`, it runs `pi --print --no-session --no-tools ...args <message>`, emits the trimmed stdout as an assistant message, and reports a nonzero exit as an error. It neither maintains a Pi conversation across messages nor reads `context.parameters` for a model or token budget. Configure Pi separately; use `args` for explicit non-secret CLI arguments. See the [starter Pi adapter](https://github.com/leostera/evalkit/blob/main/examples/starter/agents/pi-agent.ts).

For your own HTTP service or SDK, implement `start`/`send`/`close` with per-trial isolation and emit normalized events from real responses. `agentsSdk()` in `@evalkit/agents` currently **throws immediately**; [`examples/agents-sdk`](https://github.com/leostera/evalkit/tree/main/examples/agents-sdk) is a sketch, not a runnable remote transport. See [current limitations](/docs/manual/troubleshooting/#current-limitations).
