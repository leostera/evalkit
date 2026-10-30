---
title: Agents under test
description: Connect an AUT, implement a trial session, and emit scoreable evidence.
---

The **Agent Under Test (AUT)** is the assistant, process, or service you want to measure. A _scorer_ decides whether its behavior was good; it is not the AUT. EvalKit knows only the adapter you provide, not your provider's chat or tool API. Each trial writes its datasets' files, then calls `agent.start(...)` to create a fresh session. The runner passes `user(...)` messages to `session.send(message)` in order, evaluates interleaved `predicate(...)`, `judge(...)`, and `expectToolCall(...)` steps against the completed turn, calls `session.close()`, and runs final predicates and judges over the recorded events and files.

## Implement an adapter

An adapter has an `identity` and `start({ context, runtime?, onEvent })`, which returns a session. The session's `send(message)` resolves when the turn is done and may **return the turn's result**, which EvalKit records: a string is the reply; an object can carry the `reply`, the `toolCalls` the agent made, and token `usage`. `close()` is optional. `runtimes` defaults to `{ local: { kind: 'in-process' } }` and `identity.name` to `identity.id`.

```ts
// agents/support-agent.ts
import { defineAgent } from '@leostera/evalkit';
import { answer } from '../src/support.js'; // your agent

export const supportAgent = defineAgent({
  identity: { id: 'support-agent', kind: 'in-process' },
  async start({ context }) {
    const history: string[] = [];
    return {
      async send(message: string) {
        history.push(message);
        const result = await answer(history, {
          model: context.parameters?.model,
        });
        return {
          reply: result.text,
          toolCalls: result.tools.map((tool) => ({
            name: tool.name,
            arguments: tool.input,
            result: tool.output,
          })),
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          },
        };
      },
    };
  },
});
```

A returned result is recorded after any events emitted during `send()`: one `tool-call` (and `tool-result` when `result` is given) per tool call, then the assistant `message` with the reply, then the usage on the turn's completion. Replies, arguments and results may be any plain values; they are converted to JSON once, and a value that cannot be (a function, `bigint`, a cycle) fails the trial with the path of the bad field.

### Streaming events

To record activity as it happens (long tool loops, intermediate messages), call and await `onEvent` during the turn instead of, or as well as, returning a result. Lifecycle events (`started`, `turn-started`, `turn-completed`, `completed`) are optional: the runner records when each step starts and ends, and their durations. Emit them only to attach data such as usage. `timestamp` defaults to the time the event is recorded.

```ts
async send(message: string) {
  for await (const step of runAgent(message)) {
    if (step.type === 'tool')
      await onEvent({ kind: 'tool-call', id: step.id, name: step.name, arguments: step.input });
    if (step.type === 'text')
      await onEvent({ kind: 'message', role: 'assistant', content: step.text });
  }
}
```

The adapter owns the actual agent invocation and session isolation. For a multi-message conversation, keep conversation state in this per-trial session; EvalKit does not reconstruct it from events for you. Emit the **actual** tool calls, tool results, messages, and usage your integration observes, rather than claiming tool activity that did not happen.

### Trial context and runtime

`context` provides `runId`, `evalId`, `trialId`, zero-based `trialIndex`, `metadata` (including a fresh numeric `randomSeed`), `workspace.root` for candidate-visible files, `evaluatorWorkspace.root` for trusted evaluator data, `data` with the values of the scenario's candidate [datasets](/docs/manual/datasets/) by ID, and optional `parameters` and `runtime`. `{{randomSeed}}` in a `user(...)` message is replaced before `send()` is called. Never put the evaluator workspace path or contents into a model prompt; trusted adapters have access to it, so enforce this boundary yourself.

`runtimes` advertises supported names (`local`, `remote`, `sandbox`) with `{ kind, configuration? }` metadata. A selected runtime is passed to `start()` both as `context.runtime` (its name) and as `runtime` (the declared object). The adapter interprets the declaration; merely declaring `remote` or `sandbox` does not provide a transport or isolation. A run requesting an undeclared runtime fails. Without an explicit choice, a direct runner call passes no selected runtime; CLI matrix execution chooses the first declared runtime in `local`, `remote`, `sandbox` order. `--local` explicitly requests `local`.

Matrix axis values and CLI flags such as `--max-tokens` appear in `context.parameters`; EvalKit does **not** map them to provider settings. If your adapter offers model selection, read (and validate) `context.parameters?.model` and use it when invoking your provider. The [configured-matrix example](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/agents/case-agent.ts) shows this with a provider-free `style` axis.

## Events and the recorded trajectory

Returned results and `onEvent` calls append evidence in order. AUT events get `source: 'aut'`; the runner also records `source: 'runner'` events for trial and step starts/completions, scorer activity, and errors. Scorers receive both in `trajectory.events`, and reports store them as JSON Lines in `trajectory.jsonl`.

| AUT event `kind`                 | Notable fields                                                              | When to emit                                       |
| -------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `started`, `completed`, `error`  | `timestamp`; optional JSON `output` on completed, recorded error on error   | AUT lifecycle or AUT-reported error.               |
| `message`                        | `role` (`system`, `user`, `assistant`, `tool`), JSON `content`, `timestamp` | An observed message. A returned reply becomes one. |
| `tool-call`, `tool-result`       | Shared call `id`, tool `name`, JSON arguments/result, `timestamp`           | Actual tool activity.                              |
| `turn-started`, `turn-completed` | Turn number; optional `latencyMs` and token `usage` on completion           | A turn boundary and any measured usage.            |

Timestamps are ISO strings; omit them to use the time of recording. Any turn-completion usage or latency you emit is available in the trajectory; EvalKit does not infer provider tokens or latency from message text. If `start()`, `send()`, or `close()` throws, the runner records an error, closes an opened session, and normally skips scoring except [partial-support predicates](/docs/manual/scoring-and-evals/#partial-execution-and-errors). `close()` should release resources even after an unsuccessful turn.

## Built-in and custom integrations

`piAgent({ command?, args? })` (from `@evalkit/agents` inside this monorepo, or `@leostera/evalkit` from npm in standalone projects) invokes the local `pi` command in the candidate workspace. For **each** `send()`, it runs `pi --print --no-session --no-tools ...args <message>`, emits the trimmed stdout as an assistant message, and reports a nonzero exit as an error. It neither maintains a Pi conversation across messages nor reads `context.parameters` for a model or token budget. Configure Pi separately; use `args` for explicit non-secret CLI arguments. See the [starter Pi adapter](https://github.com/leostera/evalkit/blob/main/examples/starter/agents/pi-agent.ts).

### Evaluating tool-assisted agents

The built-in `piAgent()` disables tools, so it cannot measure whether an agent finds or uses live MCP resources. For a live-tool experiment, implement a custom adapter that explicitly configures the intended MCP server/tools and records observed `tool-call` and `tool-result` events. `expectToolCall(...)` asserts that an adapter emitted a matching call; it does not invoke a tool, prove the result was correct, or prove the final answer used it. Score both the retrieval/action and the task outcome.

Keep baseline and treatment prompts, model, and other settings fixed; vary only tool or memory access, repeat trials, and include a negative control for irrelevant context. Passing a saved memory dataset to the model tests the value of **injected memory**, not live retrieval. Label the experiment accordingly. `context.evaluatorWorkspace.root` is trusted data: a controlled adapter may read a specific evaluator dataset for a treatment, but only pass the intended content to the model and treat it as model-visible data. Review prompts, reports, and sandboxes for secrets before sharing.

For your own HTTP service or SDK, implement `start`/`send`/`close` with per-trial isolation and emit normalized events from real responses. `agentsSdk()` in `@evalkit/agents` currently **throws immediately**; [`examples/agents-sdk`](https://github.com/leostera/evalkit/tree/main/examples/agents-sdk) is a sketch, not a runnable remote transport. See [current limitations](/docs/manual/troubleshooting/#current-limitations).
