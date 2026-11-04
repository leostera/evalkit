# RFD0009 - ATXF Transcripts, Run Limits and Isolation

- Feature Name: `atxf-limits-isolation`
- Status: Accepted
- Author: `leostera`
- Start Date: `2026-11-04`
- Updated: `2026-11-04`
- Discussion PR: `TBD`
- Tracking Issue: `TBD`

## Summary

Three changes to what an agent adapter gives EvalKit and gets from it, made together so adapters break once:

1. **Transcripts are [ATXF](https://atxf.leostera.dev).** What the agent did is saved as an ATXF 0.1 transcript, `transcript.atxf.jsonl`, in place of EvalKit's own eight event kinds. EvalKit's events (transcript steps, checkpoints, scorers) move to `run-events.jsonl` and point into the transcript by record ID. Scorers, judges and the dashboard read the transcript through a few helpers. Adapters for agents ATXF already converts (pi, Claude Code, Codex, OpenCode, Gemini CLI) can import the agent's own session file and keep it losslessly.
2. **Limits are declared by the eval and enforced by EvalKit.** `limits: { steps, tokens, time }` in the config, a scenario, a matrix cell or on the command line. The agent sees them as `context.limits`; EvalKit counts from the transcript and stops a run that goes over. A run that hits a limit ends as **limited**, not errored, and is still graded by scorers that support partial work.
3. **Runs can be isolated.** `isolation: container({ image, network })` runs each run's processes in their own container, with the candidate workspace mounted and the evaluator workspace not. Adapters and graders get the run's processes through `context.shell`, which lives for the whole session. Shared fixtures start once per invocation and are reachable from each run's container.

This is report schema version 7. `evalkit upgrade` converts existing results to it, each old trajectory into an ATXF transcript that keeps the old events as its native records, and the share server does the same for stored and incoming uploads, so no result is lost.

## Motivation

Running a real project's evals on 0.10 (7 scenarios in which a coding agent builds a small web service, 2 models × 2 × 2 settings, 56 runs of several minutes each) showed three gaps.

**The transcript format loses what matters and keeps nothing else.** Each adapter translates its agent's native stream into `message`, `tool-call`, `tool-result`, `turn-started`, `turn-completed`, `started`, `completed` and `error` ([`packages/core/src/aut-events.ts`](../../packages/core/src/aut-events.ts)). Reasoning, context compaction, sub-agents, the system prompt and tools the model was given, and per-message models are dropped, and the agent's own session is not kept unless the adapter attaches it by hand. Every adapter writes the same translation again. ATXF is a transcript format that already models all of this, with lossless converters for five coding agents and a TypeScript library (`@leostera/atxf`).

**Limits live in each agent.** The project's coding agent stops at 40 model calls, a constant in its own adapter. 11 of the 56 runs hit it, and EvalKit recorded them as **errored**, the same as a crashed sandbox, so they read as broken infrastructure rather than "this model needed more steps". Raising or comparing the limit means editing the agent. EvalKit already passes `--max-tokens`, `--turn-budget` and `--chat-timeout-ms` through to agents as parameters, but enforces none of them, and nothing stops an agent that ignores them.

**Runs are not confined.** Since 0.10 each run's workspace is outside the project, but runs share a parent directory, a machine and a process table. One agent cleaned up with `pkill -f '<dev server>'` and stopped the shared local service and every concurrent run's server; every run after it failed for reasons that had nothing to do with it. The project built its own confinement: a macOS `sandbox-exec` profile denying other runs' directories and signals to processes outside the sandbox, plus one long-lived sandboxed shell per agent session so the agent could stop a server it started in an earlier command. Every project that runs agents with tools needs this, and it belongs in EvalKit.

## Goals

- One transcript format for every agent, rich enough for coding agents, that keeps the agent's own session when one exists.
- An adapter for an agent ATXF converts is a few lines: run it, read its session, import it.
- Scorers and judges read what the agent did through helpers, not by walking raw records.
- Limits on steps, tokens and wall-clock time, declared per project, scenario, matrix cell or invocation, visible to the agent, and enforced by EvalKit whatever the agent does.
- Hitting a limit is its own outcome, counted and shown apart from failing and erroring.
- Each run's processes in their own container when asked, with the evaluator workspace out of reach and other runs' processes out of signal range.
- Fixtures shared by runs (a local service, an emulator) that start once and are reachable from each run.

## Non-goals

- Defending against agents that try to escape a container. Isolation stops accidents and keeps runs independent; it is not a security boundary against hostile code.
- Recovering what old trajectories never recorded. A converted transcript has what the old events had: no reasoning, no instructions, no tools.
- Branching evaluation sessions. ATXF transcripts are trees, and EvalKit keeps whatever the agent records, but scripted transcripts only append to the active path.
- Cost in money. Usage stays tokens; EvalKit still infers nothing an adapter does not report.
- Remote sandboxes (a hosted container service). The isolation interface should allow one later.

## Guide-level explanation

### Writing an adapter

An adapter that returns each turn's reply keeps working; EvalKit writes the ATXF records for it:

```ts
defineAgent({
  identity: { id: 'echo', name: 'Echo' },
  async start() {
    return { send: async (message) => `You said: ${message}` };
  },
});
```

An adapter that streams writes records to the run's transcript. It gets a writer instead of `onEvent`:

```ts
async start({ context, transcript }) {
  return {
    async send(message) {
      transcript.user(message);
      for await (const step of runModel(message, { signal: context.signal })) {
        transcript.assistant({
          content: step.content, // text, reasoning and tool_call blocks
          model: step.model,
          usage: { input: step.inputTokens, output: step.outputTokens },
        });
        for (const call of step.toolCalls)
          transcript.toolResult(call.id, await runTool(call, context.shell));
      }
    },
  };
},
```

An adapter for an agent ATXF converts runs the agent and imports its session when the turn ends:

```ts
import { pi } from '@leostera/atxf/pi';

async send(message) {
  // Run the agent's CLI for one turn; it writes its own session file.
  await context.shell.exec(['pi', '--print', '--session', SESSION, message], {
    signal: context.signal,
  });
  transcript.import(pi.toAtxf(await context.shell.readFile(SESSION)));
},
```

An imported transcript keeps the agent's own records in `native`, so the run's Logs can offer the agent's own session file and `atxf convert` can turn it into any other agent's.

### Scoring

Scorers read the transcript through helpers:

```ts
import { lastReply, predicate, toolCalls } from '@leostera/evalkit';

predicate('ran the tests', (ctx) =>
  toolCalls(ctx, 'shell').some(({ call }) =>
    String(call.arguments.command).includes('test'),
  ),
);
predicate('cites the docs', (ctx) =>
  lastReply(ctx).includes('docs.example.com'),
);
```

`messages(ctx)`, `toolCalls(ctx, name?)` (each call with its result), `lastReply(ctx)`, `usage(ctx)` and `modelContext(ctx)` (what the model saw at the end, from ATXF's `buildContext`) cover most scorers; `ctx.transcript` is the whole ATXF transcript for the rest. A checkpoint sees the transcript up to its step. A judge's default `conversation` and `reply` inputs come from the same helpers, and a judge's own session is saved as an ATXF transcript too.

### Limits

```ts
// evalkit.config.ts
export default defineConfig({
  limits: { steps: 40, time: '20m' },
  matrix: {
    id: 'models',
    parameters: { model: ['luna', 'terra'] },
    limits: { steps: [40, 80] }, // compare what twice the steps buys
  },
});
```

A scenario can set its own `limits`; `evalkit run --limit steps=80 --limit time=1h` overrides both. The agent reads `context.limits` and can wrap up before reaching one. EvalKit counts every assistant message as a step and every reported token, and starts a run's clock when its session starts. When a run goes over, EvalKit aborts `context.signal`, closes the session, and stops the run's container if it has one. The run ends as **limited**:

```
✗ todo-app  model=luna  limited: 40 of 40 steps · score 0.40 (graded what it left)
```

Scorers with `supportsPartial: true` grade what the agent left; the rest are skipped. A limited run does not pass. The scoreboard and Compare count limited runs apart from failures, and `steps` and `time` are built-in metrics next to the token metrics, each shown against its limit when one is set.

### Isolation

```ts
import { container, defineConfig } from '@leostera/evalkit';

export default defineConfig({
  isolation: container({
    image: './evals/Dockerfile', // or 'node:22'
    network: 'fixtures', // 'none' | 'fixtures' | 'full'
  }),
  fixtures: {
    store: {
      start: 'bun run fixtures/store.ts',
      ready: 'http://localhost:8787/health',
    },
  },
});
```

Each run gets a container from the image, with its candidate workspace mounted read-write at `/workspace`. The evaluator workspace is never mounted. The run's processes have their own process table, so `pkill` reaches only that run. With `network: 'fixtures'`, a run can reach the fixtures, reachable at `fixtures.<name>` from inside, and nothing else. Fixtures start before the first run of an invocation and stop after the last, and their output is attached to the runs that used them.

`context.shell` is the run's shell: `exec` a command, `spawn` a long-lived process, read and write files. It is the same shell across a session's commands, so an agent can stop a server it started earlier. Adapters that run an agent CLI run it through `context.shell`, which puts the whole agent in the container; in-process agents run their tools through it. Scorers get the run's `context.shell` too, to start the agent's program, exercise it and read its logs.

Without `isolation`, `context.shell` runs commands on the host in the run's workspace, as adapters do today.

## Reference-level explanation

### Report schema version 7

A run's directory:

```
<run>/
├── manifest.json
├── transcript.atxf.jsonl     # the agent's session, ATXF 0.1
├── transcripts/<id>.atxf.jsonl  # sub-agent transcripts, linked from the main one
├── run-events.jsonl          # EvalKit's events, pointing into the transcript
├── scoring.json
├── summary.json
└── artifacts/
```

`trajectory.jsonl` is gone. `manifest.json` records `limits` (the values in force) and `isolation` (backend, image digest, network). `summary.json` records `status: 'limited'` with `limit: { kind: 'steps' | 'tokens' | 'time', value, used }`.

### The transcript

- The header's `source.agent` is the adapter's identity ID, with `source.version` when known. `workspace.cwd` is left out (paths are run-specific); `ext.evalkit` holds `{ runId, scenarioId }`.
- Ids are opaque. EvalKit generates them for records it writes and keeps an imported transcript's own.
- EvalKit validates every record with `@leostera/atxf`'s validator as it is appended. An invalid record is an adapter error, recorded and shown like one.
- Records written by EvalKit for a returned `TurnResult`: the user message (`origin.kind: 'synthetic'`, since EvalKit scripted it), then an assistant message with text and `tool_call` blocks, then a `role: 'tool'` message per result, with `usage` and `model` on the assistant message.
- `transcript.import(t)` appends an ATXF transcript's records after the current active leaf, keeping their ids and `native`, and sets `fidelity` from it. Importing again at the end of each turn appends only records not imported before (by id).
- Writers append complete records. A streaming adapter writes an assistant message once its content is complete; the dashboard updates live as records arrive.

### Run events

`run-events.jsonl` holds EvalKit's events with the kinds `RunnerEvent` has today (`run-started`, `transcript-step-started`, `checkpoint-completed`, `scorer-completed`, …) plus `limit-reached`. Each carries `at`, the ID of the transcript's active leaf when it happened, or `null` before the first record, which places it in the transcript without relying on timestamps. A checkpoint that matched a tool call records the ID of the assistant message holding the `tool_call` block and the call's ID.

### Usage

EvalKit's `Usage` becomes ATXF's: disjoint `input`, `cacheRead`, `cacheWrite` and `output` (which includes `reasoning`), with `total` their sum. Adapters convert their provider's conventions; the old `inputTokens`/`cachedInputTokens` (cached as a subset of input) go away. Cache reads are cheap and dominate long coding sessions, so EvalKit keeps them apart from tokens the model had to process. Every sum below is over usage on assistant messages, compactions and branch summaries, and non-cumulative usage records, as the ATXF spec defines transcript totals. The built-in metrics:

| Metric           | Sum of                                         | Better |
| ---------------- | ---------------------------------------------- | ------ |
| `tokens`         | `input + cacheWrite + output` (uncached)       | lower  |
| `cached tokens`  | `cacheRead`                                    | —      |
| `output tokens`  | `output`                                       | lower  |
| `cache hit rate` | `cacheRead / (input + cacheRead + cacheWrite)` | higher |
| `judge tokens`   | `tokens`, over judge transcripts               | lower  |

`cache hit rate` is the share of input tokens read from a cache, between 0 and 1, and **not measured** when the run reported no input. The run page shows the split under the agent's tokens ("1.2M tokens · 9.8M cached · 89% cache hits"), and the scoreboard and Compare can show any of them.

This changes what `tokens` means: before 0.11 it included cache reads. `evalkit upgrade` recomputes it from the converted transcripts, so old and new runs compare.

### Scorer and judge API

- `ScoringContext.trajectory` is replaced by `ScoringContext.transcript: Transcript` (ATXF) and `ScoringContext.runEvents`.
- Helpers, exported from `@leostera/evalkit`: `messages(ctx, role?)`, `toolCalls(ctx, name?) → { call: ToolCallBlock; result?: ToolBody }[]`, `lastReply(ctx): string`, `usage(ctx): Usage`, `modelContext(ctx)`. Each reads the active path.
- Judge results store `judge.transcript` (ATXF) in place of `judge.events`.

### Adapter contract

- `start` receives `transcript` (the writer: `user`, `assistant`, `toolResult`, `turn`, `append`, `import`) in place of `onEvent`.
- `context.signal: AbortSignal` aborts when the run hits a limit or is cancelled. Adapters should pass it to model calls and tool processes.
- `context.limits: { steps?, tokens?, time? }` are the limits in force, with `time` in milliseconds.
- `context.shell` (see Isolation).
- `AutEventInput`, `onEvent`, `normalizeAutEvent`, `turnResultEvents` and the `AutEvent` type are removed. `TurnResult` stays, with ATXF usage field names.

### Limits

- Resolution, later wins: config `limits`, scenario `limits`, the matrix cell's `limits` axes, `--limit kind=value` (repeatable). Each kind resolves separately.
- **Steps**: assistant messages in the run's transcript, sub-agents included. Checked when each record is appended.
- **Tokens**: the `tokens` metric (uncached input, cache writes and output; cache reads do not count), sub-agents included, judges not. Checked on each append.
- **Time**: from the session's start to the end of its last turn, scoring excluded. Checked by a timer.
- When exceeded: EvalKit appends a `limit-reached` run event, aborts `context.signal`, waits up to 10 seconds for the current `send` to settle, calls `close()`, and stops the container if isolated. Records appended after the limit are kept, so the transcript shows what the agent did.
- The run's status is `limited`. Final scorers with `supportsPartial` run; others are recorded as skipped with the reason. Checkpoints not reached are skipped.
- Counting: a limited run is not a pass. Pass rates count it in the denominator. The scoreboard, Compare and the CLI summary show limited runs as their own count.
- `--max-tokens`, `--turn-budget` and `--chat-timeout-ms` are removed; `--limit` replaces them.

### Isolation

- `isolation` in config takes `none()` (the default), `container(options)` or `sandboxExec(options)` (macOS).
- `container({ image, network = 'none', runtime?, env?, mounts? })`:
  - `image` is an image reference or a Dockerfile path. A Dockerfile is built once per invocation, tagged by the hash of its directory, and reused while unchanged.
  - EvalKit talks to Docker through the `docker` CLI only, so anything that provides it works: Docker Desktop, OrbStack, Colima, Rancher Desktop, or podman's `docker` command. `runtime` names another binary with the same commands (`'podman'`). When none is found, a run with container isolation fails before it starts, saying what to install.
  - The `fixtures` network is a Docker network created with `--internal` for the invocation, with the fixtures attached through the host gateway, and removed at the end.
  - One container per run, started before the session and removed after scoring, kept when the run did not pass and `keep` says so, like workspaces today.
  - The candidate workspace is bind-mounted at `/workspace`, read-write. `mounts` adds read-only host paths. The evaluator workspace is never mounted.
  - `network`: `none` (no network), `fixtures` (an internal network shared with the fixtures only), `full` (the runtime's default).
  - `env` passes named host variables into the container; nothing else is passed.
- `sandboxExec({ allow })` runs each run's processes under a generated `sandbox-exec` profile: reads and writes inside the run's workspace and `allow`, signals only within the sandbox, and one long-lived sandboxed shell per run. It exists for macOS projects that cannot use containers and has the same `context.shell` interface.
- `context.shell`:
  - `exec(command: string | string[], { cwd?, env?, signal?, timeoutMs? }) → { stdout, stderr, exitCode }`.
  - `spawn(command, options) → { pid, stdout(), stderr(), onOutput(listener), wait(), kill(signal?) }`. Output is always read and the last megabyte kept, so a server nobody reads never blocks on a full pipe.
  - `readFile`, `writeFile`, `list`, relative to `/workspace`.
  - One shell per run, shared by the adapter and the run's scorers. Processes it spawned are killed when the run ends.
- `fixtures: Record<name, { start, ready?, stop?, port? }>` in config. `port` is taken from `ready` when that is a URL; containers need it to reach the fixture. Each run gets `context.fixtures: Record<name, { url }>`, the address as that run reaches it: `localhost` on the host and in a sandbox, `fixtures.<name>` on the fixtures network, `host.docker.internal` with `network: 'full'`. EvalKit starts each fixture before the first run that needs it and stops it after the last run of the invocation. `ready` is a URL polled until it answers, or a command that must exit 0. Fixture output is attached to every run that ran while it was up, as `logs/fixtures/<name>.log`. Fixtures run on the host, reachable from containers through the `fixtures` network.

### Dashboard

The trajectory renders the transcript's active path: user messages, assistant messages with their reasoning (folded), text and tool calls paired with results, compactions as a marker with their summary, sub-agents as a nested, foldable transcript, and run events (steps, checkpoints, the limit) placed by their `at`. All events lists the raw ATXF records. A run's Logs section offers `transcript.atxf.jsonl` and, for imported transcripts with native records, the agent's own session file.

## Data migration and compatibility

`evalkit upgrade` converts results to schema version 7 in place: versions 2 to 5 go through version 6 as today ([RFD0008](RFD0008-runs-without-trials.md)), then each version 6 run is converted as below. Until a project is upgraded, version 7 readers hide older runs and show how many there are, with "run `evalkit upgrade`", as 0.9 does for runs from before it.

### Converting a trajectory

`trajectory.jsonl` splits into `transcript.atxf.jsonl` and `run-events.jsonl`. The conversion is a pure function of the old run directory, tested on fixtures of every event kind and as a property (any valid version 6 trajectory converts to a transcript that `@leostera/atxf` validates):

- **Header.** `source.agent` is the manifest's agent ID, `source.format` is `evalkit-trajectory-v6`. `fidelity` says what the old format had: `topology: 'linear'`, `instructions: 'none'`, `tools: 'none'`, `reasoning: 'none'`, `usage: 'per-response'` (or `'none'` when no turn reported usage), `turns: true`, `ids: 'synthetic'`, `native: 'all'`.
- **Messages.** An AUT `message` becomes a `message` record with its role. String content becomes a text block; any other JSON content becomes a text block of its JSON, with the original value in `ext.evalkit.content`.
- **Tool calls.** Consecutive `tool-call` events of a turn become `tool_call` blocks (`kind: 'function'`) on one assistant message: the assistant message just before them in the same turn when there is one, a new empty one otherwise. Each `tool-result` becomes a `role: 'tool'` message for its call ID, as a child of that assistant message.
- **Turns.** `turn-started` and `turn-completed` become `turn` records with `phase: 'start'` and `'end'` and the same `turnId`. A turn's `latencyMs` goes in `ext.evalkit`.
- **Usage.** A `turn-completed` event's usage moves to the turn's last assistant message, converted to ATXF's buckets: `cacheRead` is the old `cachedInputTokens`, `input` is `inputTokens - cachedInputTokens`, `output` is `outputTokens`. A turn with no assistant message gets a `usage` record instead. Its `model` becomes the message's model.
- **The rest.** `started`, `completed` (with its `output`) and AUT `error` events become `custom` records in the `evalkit` namespace, so nothing is dropped.
- **Native records.** Every ATXF record carries the old events it came from in `native`, so the old trajectory can be rebuilt exactly. A converted transcript is lossless; it only lacks what the old format never had.
- **Run events.** Every `source: 'runner'` event goes to `run-events.jsonl` in order, with `at` set to the ID of the last transcript record derived from an AUT event before it.
- **References.** A checkpoint's `matchedToolCall: { eventIndex, id }` becomes the ID of the assistant message holding the call and the call's ID. Judge results' `events` become `judge.transcript`, converted the same way with the judge agent as `source.agent`.
- **Metrics.** The token metrics are recomputed from the converted transcripts. As a check, `tokens + cached tokens` must equal the saved `tokens` (which included cache reads), and likewise for `judge tokens`; the converter fails the run's conversion if they do not, and leaves the run untouched.

Upgrading is idempotent and per run: a run that fails to convert is left at version 6 and reported, and the rest go on. The share server converts stored runs when it upgrades (`POST /api/v1/upgrade`) and runs uploaded by older CLIs as they arrive, as it does for version 5.

### Code

Every adapter and every scorer that reads `ctx.trajectory` changes. The CHANGELOG lists each removed name with its replacement.

## Rollout

1. The transcript: schema version 7, the writer, helpers, the scorer and judge API, the dashboard, and the `evalkit upgrade` and share-server conversion. The examples and the starter move to it.
2. Limits: resolution, counting, enforcement, the `limited` status and its counting, the CLI and dashboard.
3. Isolation: `context.shell` on the host first (the default), then `container`, then `fixtures`, then `sandboxExec`.
4. Release 0.11.0 with all three.

Each step lands with tests: unit tests for the writer, the helpers and limit resolution; an end-to-end test of a limited run; and container tests that run only when `docker` is present.

## Drawbacks

- Every adapter and many scorers break. At major version 0 and with few users this is cheap now and expensive later.
- EvalKit depends on `@leostera/atxf` and a draft spec. Changes to ATXF become EvalKit changes. Both are maintained together, which makes this manageable, and EvalKit will be ATXF's first large consumer.
- ATXF records are more verbose than EvalKit's events, so transcripts are larger. Native passthrough roughly doubles an imported transcript.
- Containers make runs slower to start and add a dependency many machines lack; on macOS they run in a VM, and file access through a bind mount is slower.

## Alternatives

- **Keep EvalKit's events, add kinds, attach the native session.** Less breaking, but EvalKit keeps maintaining its own format and every adapter its own translation, and the attached session is not something scorers or the dashboard can read.
- **OpenTelemetry GenAI semantic conventions.** Good for live telemetry across services, but spans are not a transcript: no tree, no compaction, no lossless round trip.
- **Limits left to agents, with EvalKit only recording that a limit was hit.** Simpler, but every agent must implement them and nothing stops one that does not.
- **Isolation left to adapters.** Today's state; every project rebuilds it.

## Prior art

- Inspect AI runs tools in per-sample Docker sandboxes, with `exec` and file access through a sandbox interface, and enforces message, token and time limits per sample.
- Harbor and Terminal-Bench run each task in its own container and save agent trajectories in a shared format.
- SWE-bench builds one Docker image per task environment.
- The real project above, whose `sandbox-exec` profile and per-session shell are the model for `sandboxExec` and `context.shell`.

## Decisions

- **Fixtures reach containers through a proxy.** A Docker `--internal` network cannot reach the host, so each fixture gets a small proxy container (busybox `nc`, one process per connection) on both the default network and the internal one, with the alias `fixtures.<name>`, forwarding to the host's port.
- **One supervisor per sandboxed run.** Each `sandbox-exec` invocation is its own sandbox, so a later command could not signal a server an earlier one started. The run's commands are children of one sandboxed supervisor instead, which they reach over a line protocol.
- **Each command leads its own process group**, so the run can stop a command's children with it. The terminal's Ctrl+C no longer reaches them; the runner stops them on cancellation, and kills every group still alive when the process exits.
- **The manifest records the isolation** (`{ kind, image, network }`, no host paths or environment), so runs from different setups are told apart.

- **Cache reads are their own numbers.** `tokens` and the `tokens` limit count uncached input, cache writes and output; `cached tokens` and `cache hit rate` report the rest (see Usage).
- **A step is an assistant message**, one model call, which is what agents call a step. Turns stay visible in the trajectory.
- **Transcripts are sealed.** EvalKit writes every transcript with integrity hashes (`integrity: { alg: 'sha256', canon: 'jcs' }`) and appends a seal when the run ends. The share server stores them; verifying uploads is left for later. Converted transcripts are sealed too.
- **Docker only, for now.** Container isolation uses the `docker` CLI (or a compatible one such as podman's). One implementation covers most machines, and Docker's internal networks give `network: 'fixtures'` directly.
- **Fixtures run on the host**, reachable from containers through the `fixtures` network. Running them in containers can come later without changing how scenarios use them.
- **Old total-only usage.** An old turn that reported only `totalTokens` is converted as `input: 0, output: 0, total: <total>` with `ext.evalkit.totalOnly: true`, and counts toward `tokens` by its total. If ATXF later allows `total` alone, the converter follows.

## Unresolved questions

None open. Apple's `container` CLI is left for later (see Future possibilities).

## Future possibilities

- Apple's `container` CLI as a second container runtime, once its networking can give runs a private network shared only with the fixtures.

- `evalkit rescore`: re-run judges on saved transcripts, since they read only saved inputs, so a rubric or judge model can change without re-running agents.
- Remote isolation backends (a hosted sandbox service) behind the same `context.shell`.
- Continuing a saved run's session in the agent it came from, by converting its transcript back with ATXF.
- Comparing two runs' transcripts step by step.
