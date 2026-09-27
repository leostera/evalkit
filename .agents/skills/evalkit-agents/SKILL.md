---
name: evalkit-agents
description: Add, adapt, or debug Evalkit Agents Under Test (AUTs). Use when connecting an agent or process, implementing the session adapter, emitting events, or handling trial workspaces and runtime parameters.
---

# Add an Evalkit agent

Read `../evalkit/SKILL.md` for shared constraints and `../../../www/src/content/docs/manual/agents.md`. Inspect `../../../packages/core/src/index.ts` (`AutAdapter`, `AutContext`, `AutEvent`), `../../../examples/starter/agents/greeting-agent.ts`, and `../../../packages/agents/src/index.ts` before editing.

1. Identify the **Agent Under Test (AUT)**: the assistant, process, or service whose behavior the eval measures, not the scorer that grades it. Its adapter starts a fresh session per trial, receives user messages, and emits the evidence scorers inspect. Decide whether to reuse `piAgent()` for the local Pi CLI or implement `defineAgent({ identity, runtimes, start })` for a different agent. `agentsSdk()` currently throws; do not claim it is a usable remote adapter.
2. Give the new agent a stable, unique lowercase kebab-case `identity.id`, meaningful `name`/`kind` and optional version. A declared runtime has `kind` and optional serializable `configuration`; the local CLI selects the first declared runtime among local/remote/sandbox, or lets an adapter without runtimes use its default. Only declare a runtime your adapter really supports.
3. In `start({ context, runtime, onEvent })`, initialize a **new trial session**. Use `context.workspace.root` for candidate-visible data; never expose `context.evaluatorWorkspace.root` or trusted answers to the model. Read `context.parameters` if flags or matrix axes should affect agent behavior.
4. Return `send(message: string): Promise<void>` that resolves only after the turn finishes and a `close(): Promise<void>` that cleans up. Report responses via `onEvent({ kind: 'message', role: 'assistant', content, timestamp })`; a return value from `send` is not recorded. Emit `started`, `turn-started`, `turn-completed`, `completed` where appropriate, with ISO timestamp strings. Tool/usage/latency events are optional; content must be JSON-serializable. Propagate failures so the runner can record them.
5. Import the adapter from an eval; importing an agent alone does not make a run available to the CLI. Add or adapt a predicate to inspect its events. Test a single eval before a costly suite.

The built-in Pi adapter starts `pi --print --no-session --no-tools` once **per message**, with no session continuity, and does not consume CLI `--model`/budget parameters. For custom launch args use `piAgent({ args: [...] })` or build your own adapter that reads `context.parameters`.
