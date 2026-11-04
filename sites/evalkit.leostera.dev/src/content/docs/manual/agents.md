---
title: Agents under test
description: Connect an AUT, implement a run session, record its transcript, and set limits.
---

The **Agent Under Test (AUT)** is the assistant, process, or service you want to measure. A _scorer_ decides whether its behavior was good; it is not the AUT. EvalKit knows only the adapter you provide, not your provider's chat or tool API. Each run writes its datasets' files, then calls `agent.start(...)` to create a fresh session. The runner passes `user(...)` messages to `session.send(message)` in order, evaluates interleaved `predicate(...)`, `judge(...)`, and `expectToolCall(...)` steps against the completed turn, calls `session.close()`, and runs final predicates and judges over the recorded transcript and files.

## Implement an adapter

An adapter has an `identity` and `start({ context, runtime?, transcript, attach })`, which returns a session. The session's `send(message)` resolves when the turn is done and may **return the turn's result**, which EvalKit records: a string is the reply; an object can carry the `reply`, the `toolCalls` the agent made, token `usage` and the `model` that answered. `close()` is optional. `runtimes` defaults to `{ local: { kind: 'in-process' } }` and `identity.name` to `identity.id`.

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
          signal: context.signal,
        });
        return {
          reply: result.text,
          toolCalls: result.tools.map((tool) => ({
            name: tool.name,
            arguments: tool.input,
            result: tool.output,
          })),
          usage: { input: result.inputTokens, output: result.outputTokens },
          model: 'openai/gpt-5',
        };
      },
    };
  },
});
```

A returned result becomes one assistant message holding the tool calls, a tool result per call that has a `result`, and an assistant message with the reply, carrying the usage and model. Replies, arguments and results may be any plain values; they are converted to JSON once, and a value that cannot be (a function, `bigint`, a cycle) fails the run with the path of the bad field.

A tool call whose arguments carry a shell command (`command`, `cmd` or `script`, as a string or an argv list, with an optional `cwd`) is shown on the run page as a small terminal: the command, then its output, ending at the last lines. For that, return the result as a string, or as an object with `output` (or `stdout` and `stderr`) and an `exitCode`; a non-zero exit or `isError: true` marks the call as failed.

## The transcript

Everything an agent does is recorded as a transcript in [ATXF](https://atxf.leostera.dev), an open format for agent transcripts: messages, tool calls and their results, reasoning, usage and the model, compactions, and sub-agents. Each run keeps it in `transcript.atxf.jsonl`, sealed with a hash of every record when the run ends, so it can be checked later and read by other ATXF tools. EvalKit writes each scripted user message itself.

### Writing to the transcript

To record activity as it happens (long tool loops, several model calls per turn, reasoning), write to `transcript` during the turn instead of returning a result. Each method appends one record and returns its ID:

```ts
async start({ context, transcript }) {
  return {
    async send(message: string) {
      for await (const step of runAgent(message, { signal: context.signal })) {
        if (step.type === 'model')
          transcript.assistant({
            content: [
              { type: 'text', text: step.text },
              ...step.tools.map((tool) => ({
                type: 'tool_call' as const,
                id: tool.id,
                name: tool.name,
                arguments: tool.input,
              })),
            ],
            model: 'anthropic/claude-sonnet-4-5',
            usage: { input: step.input, output: step.output, cacheRead: step.cached },
          });
        if (step.type === 'tool-result')
          transcript.toolResult(step.id, step.output, { name: step.name, isError: step.failed });
      }
    },
  };
}
```

- `assistant({ content, model?, usage?, stop?, error? })` records one model response. `content` is text or ATXF blocks: `text`, `reasoning`, `tool_call` and `image`.
- `toolResult(callId, result, { name?, isError? })` records a tool's result: a string is its text; any other JSON value is kept as is.
- `user(content)` records a message the agent received that the scenario did not script.
- `turn('start')` and `turn('end', { turnId, outcome })` mark turns as the agent saw them; optional, since EvalKit records each step's start and end.
- `append(record)` adds any other ATXF record, such as a compaction or a link to a sub-agent.

Record the **actual** calls, results and usage your integration observes, never activity that did not happen. The adapter owns the agent's invocation and isolation; for a multi-message conversation, keep the conversation's state in this per-run session.

### Agents with their own session files

For Pi, Codex, opencode and Claude Code, use the [built-in harnesses](#coding-agent-harnesses), which do this for you. ATXF also converts Gemini CLI sessions. For an agent ATXF converts, convert the agent's session after each turn and import it: records already imported are skipped, and the native records are kept.

```ts
import { readFile } from 'node:fs/promises';
import { pi } from '@leostera/atxf/pi';

async send(message: string) {
  await runPi(message, sessionFile);
  transcript.import(pi.toAtxf(await readFile(sessionFile, 'utf8')));
}
```

A user message in the imported session that matches the scripted one stands for it. Add `@leostera/atxf` to your project to import converters.

### Sub-agents

An agent that starts sub-agents can keep their transcripts with the run: `transcript.subagent(childTranscript)` saves it in `transcripts/<id>.atxf.jsonl`, linked from the main transcript by an `agent_link` record that names its ID. Pass the whole transcript again as it grows. Sub-agents' steps and tokens count toward the run's limits and metrics, and the run page shows each one nested where it was linked.

### Reporting token usage

Usage feeds the [token metrics](/docs/manual/scoring-and-evals/#metrics) and the `tokens` limit. Report each model response's usage in ATXF's buckets, which never overlap:

| Field        | Meaning                                                               |
| ------------ | --------------------------------------------------------------------- |
| `input`      | Input tokens **not** read from or written to a prompt cache.          |
| `cacheRead`  | Input tokens read from a prompt cache.                                |
| `cacheWrite` | Input tokens written to a prompt cache.                               |
| `output`     | Generated tokens, reasoning included.                                 |
| `reasoning`  | Of `output`, how many were reasoning. Optional and informational.     |
| `total`      | The provider's own total. Used only when no other bucket is reported. |

Convert your provider's conventions. A provider that reports `input_tokens: 200, cache_read_input_tokens: 9000, cache_creation_input_tokens: 500` reports `input: 200, cacheRead: 9000, cacheWrite: 500`; one that counts cached tokens inside its prompt tokens reports `input: promptTokens - cachedTokens, cacheRead: cachedTokens`. The `tokens` metric counts `input`, `cacheWrite` and `output`; cache reads are cheap and reported apart as `cached tokens`.

## Limits

Limits stop a run that goes on too long, too many steps or too many tokens, so one stuck agent cannot burn a budget. A project sets them for every scenario, and a scenario sets its own over them:

```ts
// evalkit.config.ts
export default defineConfig({ limits: { steps: 60, tokens: 400_000, time: '20m' } });

// scenarios/refactor.eval.ts
export default defineEval({ id: 'refactor', limits: { steps: 120 }, ... });
```

| Limit    | Counts                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `steps`  | Assistant messages, one per model call, sub-agents included. A tool call and the reply after it are two steps.           |
| `tokens` | The `tokens` metric: uncached input, cache writes and output. Cache reads do not count.                                  |
| `time`   | From the session's start to the end of its last turn; scoring is not counted. Milliseconds, or `'90s'`, `'20m'`, `'1h'`. |

A matrix can sweep a limit, as an axis named `limits.steps` (`defineEvalMatrix({ ..., limits: { steps: [40, 80] } })`), and `evalkit run --limit steps=40,time=10m` overrides them all for one invocation. Each kind is resolved on its own: the project's, then the scenario's, then the matrix cell's, then `--limit`.

Steps and tokens are checked as each record is written, time by a timer. When a run reaches a limit, EvalKit records a `limit-reached` event and aborts `context.signal`; a turn in progress gets 10 seconds to stop, and whatever it writes in that time is kept. The run ends **limited**: scorers that support partial runs grade what the agent left, the others are listed as not run, and the run counts as a failure in CI and JUnit. Pass `context.signal` to model calls and tool processes so they stop at once; `context.limits` holds the limits in force.

## Isolation

Each run has a shell, `context.shell`, that runs commands where the project's isolation puts them. Run the agent's tools through it, or the whole agent when it is a CLI, and scorers get the same one to exercise what the agent built:

```ts
async start({ context, transcript }) {
  return {
    async send(message) {
      // The agent CLI runs in the run's container, or on the host without isolation.
      const { stdout, exitCode } = await context.shell.exec(['my-agent', '--print', message]);
      ...
    },
  };
}
```

- `exec(command, { cwd?, env?, input?, timeoutMs?, signal? })` runs a command to its end and resolves to `{ stdout, stderr, exitCode, signal?, timedOut? }`. A string runs with `sh -c`; an array runs as it is. A command that cannot start exits 127, a timeout 124.
- `spawn(command, options)` starts a long-lived process, such as a server: `{ pid, stdout(), stderr(), onOutput(listener), wait(), kill(signal?) }`. Its output is always read, so a process nobody reads never blocks.
- `home` is the run's private directory, outside the workspace (`/evalkit-home` in a container): for an agent CLI's config and session files. It is not in the workspace snapshot, and is removed with the run.
- `readFile(path)`, `writeFile(path, content)` and `list(path?)` work on the workspace by relative path, or on the workspace or `home` by absolute path; any other path is an error.
- Commands run with `$PWD` set to their working directory.
- Commands stop when the run reaches a limit or is cancelled (they default to `context.signal`), and everything the shell started is stopped when the run ends, background children included.

The project chooses where in `evalkit.config.ts`:

```ts
import { container, defineConfig } from '@leostera/evalkit';

export default defineConfig({
  isolation: container({
    image: './evals/Dockerfile', // or an image such as 'node:22'
    network: 'fixtures', // 'none' (default) | 'fixtures' | 'full'
    env: ['MODEL_API_KEY'], // host variables passed in; nothing else is
  }),
});
```

| Isolation              | What a run gets                                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none()`, the default  | Commands on the host, in the workspace, with the host's environment. Runs can see each other's files and processes.                                                                                                                                                                                 |
| `container(options)`   | A container per run from `image`, with the candidate workspace at `/workspace` (`context.shell.root`) and the evaluator workspace never mounted. Its own process table, so a `pkill` reaches only that run. Removed after scoring, or kept stopped for a run that did not pass, like its workspace. |
| `sandboxExec(options)` | macOS only. Each run's commands run under a generated `sandbox-exec` profile: no reading or writing the project, the home directory or other runs, except the run's workspace and `allow`; signals only within the run. For projects that cannot use containers.                                    |

**Containers** use the `docker` CLI, so Docker Desktop, OrbStack, Colima, Rancher Desktop or podman all work; `runtime: 'podman'` names another compatible command. The image needs `sh`. A Dockerfile path is built once per invocation, tagged by a hash of its directory, and reused while it is unchanged. `mounts: ['/host/path:/container/path']` adds read-only paths. On Linux, commands run as your user so the files they write stay yours. A run whose container cannot start errors, saying why.

**`sandboxExec({ allow, read, deny, env })`** keeps the agent out of the project, your home directory, other runs and other projects' runs (all of `$TMPDIR/evalkit`). `read` opens read-only holes, for an agent or toolchain installed there (`~/.bun`, `~/.local`, `node_modules`); `allow` opens read-write ones, for caches (`~/.npm`); `deny` closes more paths, such as a fixture's state. Paths starting with `~/` are in your home directory, others relative to the project. `env` scrubs the environment: runs get only `PATH`, `HOME`, `TMPDIR`, `USER`, `LANG`, `TERM` and the variables it names, so pass a run's proxy settings or Git identity in each command's `env`. All of a run's commands share one sandbox: a later command can stop a server an earlier one started, but nothing outside the run.

The manifest records each run's isolation, and its page shows it, so runs from different setups are not compared by mistake. `evalkit tidy` removes kept containers with their workspaces.

## Fixtures

Fixtures are services runs reach, such as a fake store or API. They run on the host, start before the first run of an invocation, and stop after its last:

```ts
export default defineConfig({
  fixtures: {
    store: {
      start: 'bun run fixtures/store.ts', // in the project root
      ready: 'http://localhost:8787/health', // polled until it answers; or a command that must exit 0
    },
  },
});
```

Each run finds them in `context.fixtures`, by name, as it reaches them: `context.fixtures.store.url` is `http://localhost:8787` on the host and in a sandbox, and `http://fixtures.store:8787` from a container on the `fixtures` network, which reaches the fixtures and nothing else. With `network: 'full'` it is `http://host.docker.internal:8787`; with `'none'` there are none. The port comes from `ready`, or from `port`. A fixture that exits or is not ready within 60 seconds errors the run with its output, and each run keeps the fixtures' output as `logs/fixtures/<name>.log`. On Linux, a fixture must listen on `0.0.0.0` for containers to reach it.

### Run context and runtime

`context` provides `runId`, `evalId`, `batch` (`{ id, index, size }`, only when the run is one of several [repeats](/docs/manual/scoring-and-evals/#define-and-discover-the-scenario) launched together), `metadata` (including a fresh numeric `randomSeed`), `workspace.root` for candidate-visible files, `evaluatorWorkspace.root` for trusted evaluator data, `data` with the values of the scenario's candidate [datasets](/docs/manual/datasets/) by ID, `signal` and `limits` (see [Limits](#limits)), and optional `parameters` and `runtime`. `{{randomSeed}}` in a `user(...)` message is replaced before `send()` is called. Never put the evaluator workspace path or contents into a model prompt; trusted adapters have access to it, so enforce this boundary yourself.

`runtimes` advertises supported names (`local`, `remote`, `sandbox`) with `{ kind, configuration? }` metadata. A selected runtime is passed to `start()` both as `context.runtime` (its name) and as `runtime` (the declared object). The adapter interprets the declaration; merely declaring `remote` or `sandbox` does not provide a transport or isolation. A run requesting an undeclared runtime fails. Without an explicit choice, a direct runner call passes no selected runtime; CLI matrix execution chooses the first declared runtime in `local`, `remote`, `sandbox` order. `--local` explicitly requests `local`.

Matrix axis values and `--param name=json` appear in `context.parameters`; EvalKit does **not** map them to provider settings. If your adapter offers model selection, read (and validate) `context.parameters?.model` and use it when invoking your provider. The [configured-matrix example](https://github.com/leostera/evalkit/blob/main/examples/configured-matrix/agents/case-agent.ts) shows this with a provider-free `style` axis.

### Attaching files

An agent's own records (its raw log, a session transcript, a crash dump) help review a run, but they often live in the sandbox, which is removed for runs that pass. `attach(name, content)`, passed to `start()`, saves a file with the run's results instead:

```ts
export const myAgent = defineAgent({
  async start({ context, attach }) {
    const agent = await launch(context.workspace.root);
    return {
      send: (message) => agent.prompt(message),
      async close() {
        await attach('logs/agent.log', await agent.log());
        await agent.stop();
      },
    };
  },
});
```

- **Names** are relative paths of letters, digits, `.`, `_` and `-`, not starting with a dot (`logs/agent.log`); each name can be attached once. Anything else is rejected, so a name can never escape the run's folder.
- **Content** is a string (saved as UTF-8) or a `Uint8Array`, stored as given and never interpreted. Dashboards and share servers serve it as plain bytes, never as a page.
- **Size:** a file over `artifacts.attachments.maxFileBytes` (default 5 MB) keeps its **last** bytes, where a log's errors are, and is marked truncated; an attachment that would take the run past `maxRunBytes` (default 20 MB) is rejected.
- Await it before `close()` returns; attaching after the run has finished is rejected.

Scorers and checkpoints have the same `attach` on their context, for something only they can read, such as a container's log before teardown or a file the agent reported writing. Attachments appear on the run page, linked from the verdict that attached them, and in its **Logs** section, are saved as `artifacts/attachments/<name>` and listed in the run's `summary.json`, and are included by `evalkit build` and `evalkit share` (not with `--no-workspace`). They may contain secrets, like any log.
If `start()`, `send()`, or `close()` throws, the runner records an error, closes an opened session, and normally skips scoring except [partial-support predicates](/docs/manual/scoring-and-evals/#partial-execution-and-errors). `close()` should release resources even after an unsuccessful turn.

## Built-in and custom integrations

### Coding-agent harnesses

EvalKit runs four coding agents as they ship, with their own tools, system prompts and context handling. Import them from `@leostera/evalkit` (or `@evalkit/agents` inside this monorepo):

| Adapter             | Runs                                                                                                | Its transcript             |
| ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------- |
| `piAgent()`         | `pi --print`                                                                                        | Pi's session file          |
| `codexAgent()`      | `codex exec --json`, with approvals and Codex's own sandbox off: EvalKit's isolation is the sandbox | Codex's rollout            |
| `opencodeAgent()`   | `opencode run --standalone --auto`, with a private server per command                               | `opencode session export`  |
| `claudeCodeAgent()` | `claude --print --dangerously-skip-permissions`                                                     | Claude Code's session file |

```ts
import { defineEval, piAgent, user } from '@leostera/evalkit';

export default defineEval({
  id: 'fix-the-bug',
  agent: piAgent({
    model: ({ model }) => String(model), // from the matrix cell, or a string
    configFiles: { 'models.json': await Bun.file('pi/models.json').text() },
    env: { MY_PROVIDER_API_KEY: process.env.MY_PROVIDER_API_KEY ?? '' },
  }),
  transcript: [user('The tests in test/ fail. Fix the bug.')],
  scoring: [/* … */],
});
```

Each run is one session: every user message is one invocation of the CLI, through `context.shell`, with the message on stdin, continuing the run's session. After each turn the adapter imports the CLI's own session record through ATXF, so the run's transcript has every message, tool call, token count and step, and limits apply to them. Before failing or being stopped by a limit, what the agent did is still imported. The CLI's output is attached as `logs/<id>.log`.

Every harness takes these options:

- `command`: the CLI to run (`pi`, `codex`, `opencode`, `claude` by default). With container isolation it must be in the image.
- `model`: in the CLI's own syntax, or a function of the run's parameters, for a [matrix](/docs/manual/cli-and-matrices/) model axis.
- `args`: more arguments for every turn.
- `env`: environment variables for the CLI, such as an API key or proxy settings.
- `config`: `'private'` (the default) points the CLI at a new, empty config directory in the run's private home (`context.shell.home`). Your extensions, skills, instructions and logins never reach the agent, and every run starts the same. `'user'` uses your own config instead, which isolation usually hides: open it with `sandboxExec({ read })`, and expect your setup to change what you measure.
- `configFiles`: files to write into the private config directory before the first turn, by relative path, such as a provider's settings. The agent can read them, so give it credentials it cannot use elsewhere, or point the CLI at a proxy that adds them.

Each CLI's private config directory is its usual one: `PI_CODING_AGENT_DIR` (`auth.json`, `models.json`, `settings.json`), `CODEX_HOME` (`config.toml`, `auth.json`), `CLAUDE_CONFIG_DIR`, and for opencode `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_STATE_HOME` below it (`config/opencode/opencode.json`, `data/opencode/auth.json`). With a private config, Pi also runs with `--no-extensions -e builtin:mcp --no-skills --no-prompt-templates --no-themes`, so an `mcp.json` in `configFiles` connects its MCP servers. Context files in the workspace, such as an `AGENTS.md` the task provides, are still read.

To pick options per run, such as a matrix cell's skills, config files or environment, pass a function of the run's context instead: `piAgent((context) => ({ skills: [`skills/${context.parameters.skills}`], env: { RUN: context.runId } }))`.

More options: `piAgent({ skills, appendSystemPrompt, tools: false })` (`tools: false` for a tool-less Pi, such as for a judge), `claudeCodeAgent({ appendSystemPrompt })` and `opencodeAgent({ agent })`. For another CLI, `harnessAgent(spec, options)` takes a `HarnessSpec`: its config variables, each turn's command line, how to find its session, and its ATXF converter.

### Evaluating tool-assisted agents

The harnesses above record the tool calls the agent made from its own session. For an agent of your own, implement a custom adapter that explicitly configures the intended MCP server/tools and records the tool calls and results it observes. `expectToolCall(...)` asserts that an adapter recorded a matching call; it does not invoke a tool, prove the result was correct, or prove the final answer used it. Score both the retrieval/action and the task outcome.

Keep baseline and treatment prompts, model, and other settings fixed; vary only tool or memory access, repeat runs, and include a negative control for irrelevant context. Passing a saved memory dataset to the model tests the value of **injected memory**, not live retrieval. Label the experiment accordingly. `context.evaluatorWorkspace.root` is trusted data: a controlled adapter may read a specific evaluator dataset for a treatment, but only pass the intended content to the model and treat it as model-visible data. Review prompts, reports, and sandboxes for secrets before sharing.

For your own HTTP service or SDK, implement `start`/`send`/`close` with per-run isolation and record the transcript from real responses. `agentsSdk()` in `@evalkit/agents` currently **throws immediately**; [`examples/agents-sdk`](https://github.com/leostera/evalkit/tree/main/examples/agents-sdk) is a sketch, not a runnable remote transport. See [current limitations](/docs/manual/troubleshooting/#current-limitations).
