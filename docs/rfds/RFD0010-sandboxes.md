# RFD0010 - Sandboxes

- Feature Name: `sandboxes`
- Status: Draft
- Author: `leostera`
- Start Date: `2026-11-04`
- Updated: `2026-11-04`
- Discussion PR: `TBD`
- Tracking Issue: `TBD`

## Summary

A **sandbox** is where a run happens: the machine its agent runs on and its workspace lives in. `defineSandbox({ ... })` defines one, with a lifecycle EvalKit drives: `prepare` once per invocation, then `start`, `mount`, `unmount` and `stop` for each run, and `teardown` at the end. A scenario names the sandbox it runs in. The project sets a default, and a matrix axis can pick between named sandboxes.

EvalKit ships two kinds:

- `host()`: this machine, no isolation;
- `container({ image | dockerfile })`: a container per run.

A remote sandbox, such as a Cloudflare Sandbox or a Durable Object running an agent like pi-durable, is a `defineSandbox` of your own. It uploads the workspace in `mount` and pulls it back in `unmount`.

The agent runs **inside** the sandbox, with no further control. EvalKit does not police what it does there: if it wrecks the workspace, its scorers fail, and that is the result.

Sandboxes replace both the project-wide `isolation` setting from RFD0009 and agent `runtimes`, which declared runtime names without isolating anything. This is report schema version 8; `evalkit upgrade` converts each manifest's `isolation` and `runtime` into its `sandbox`.

## Motivation

0.11 made `isolation` a project setting, and this RFD removes it entirely: sandboxes take its place. Three things it could not do:

1. **Different scenarios need different machines.** A scenario that builds a Worker needs Node and wrangler; one that tests an OCaml toolchain needs opam. One image per project means one image with everything, or one project per image.
2. **Some agents only run elsewhere.** An agent that lives in a Durable Object (pi-durable) or a hosted sandbox cannot be started on the laptop at all. Its run has to happen there, with the workspace there.
3. **Parallelism is capped by the laptop.** Each run of a coding agent holds a container for minutes. A laptop runs about four at once, while a remote sandbox service runs as many as it is given. Long matrices (56 runs × several minutes, × 3 repeats) need that.

Agent `runtimes` (`{ local: { kind: 'process' } }`) were meant for this, but only name a runtime: nothing runs anywhere differently because of them, and `--local` picks a name. They go.

## Guide-level explanation

```ts
// sandboxes.ts
import { container, defineSandbox } from '@leostera/evalkit';

export const node = defineSandbox({
  id: 'node',
  ...container({
    dockerfile: './sandboxes/node/Dockerfile',
    network: 'fixtures',
  }),
});
```

```ts
// scenarios/fix-bug.eval.ts
import { defineEval, piAgent, user } from '@leostera/evalkit';
import { node } from '../sandboxes.js';

export default defineEval({
  id: 'fix-bug',
  sandbox: node,
  agent: piAgent(),
  transcript: [user('The tests fail. Fix the bug.')],
  scoring: [/* … */],
});
```

The run starts a container from that Dockerfile, mounts its workspace in it, and runs Pi there through `context.shell`. Scorers run in the same container while it is up, so `npm test` runs with the same toolchain. Then the workspace is unmounted back to the run's directory, where judges, the snapshot and the dashboard read it.

A remote sandbox implements the same lifecycle:

```ts
export const cloud = defineSandbox({
  id: 'cloud',
  concurrency: 50,
  async start(run) {
    const box = await sandboxes.create(run.runId); // your service's API
    return {
      shell: remoteShell(box), // exec, spawn, files
      async mount(workspace) {
        await box.upload(await tar(workspace.root));
        return { root: '/workspace', home: '/home/evalkit' };
      },
      async unmount(workspace) {
        await untar(await box.download('/workspace'), workspace.root);
      },
      stop: ({ keep }) => (keep ? box.hibernate() : box.destroy()),
    };
  },
});
```

The config names the project's sandboxes and its default. A matrix axis named `sandbox` picks one by name:

```ts
export default defineConfig({
  sandboxes: { host: host(), node, cloud },
  sandbox: 'node',
});
```

```sh
evalkit run fix-bug -a sandbox=cloud -j 50
```

## Reference-level explanation

### The interface

```ts
type SandboxDefinition = {
  id: string;
  /** At most this many runs in it at once; `--concurrency` still applies. */
  concurrency?: number;
  /** Once per invocation, before its first run: build an image, deploy, warm up. */
  prepare?(context: { root: string; signal: AbortSignal }): Promise<void>;
  /** For each run. */
  start(run: SandboxRunContext): Promise<SandboxSession>;
  /** Once per invocation, after its last run. */
  teardown?(): Promise<void>;
};

type SandboxRunContext = {
  runId: string;
  evalId: string;
  parameters: JsonObject;
  fixtures: Record<string, FixtureAddress>; // as the host reaches them
  signal: AbortSignal;
};

type SandboxSession = {
  /** Commands in the sandbox: `context.shell` for the agent and scorers. */
  shell: SandboxShell; // exec, spawn, readFile, writeFile, list
  /** Puts the run's workspace in the sandbox; says where it is there. */
  mount(workspace: { root: string }): Promise<{ root: string; home: string }>;
  /** Brings the workspace back into `workspace.root`, as the sandbox left it. */
  unmount(workspace: { root: string }): Promise<void>;
  /** Fixtures as the sandbox reaches them, when it reaches them differently. */
  fixtures?: Record<string, FixtureAddress>;
  stop(options: { keep: boolean }): Promise<void>;
};
```

`Shell` (RFD0009) keeps its methods. `root` and `home` come from `mount`. The shell's file operations work on the sandbox's copy.

### A run's lifecycle

1. The first run in a sandbox calls `prepare`; runs wait for it. A failed `prepare` errors every run in that sandbox, naming it.
2. `start`, then `mount` with the candidate workspace: datasets already written, the evaluator workspace never passed.
3. The agent session. The adapter runs the agent through `context.shell`, which runs in the sandbox. Checkpoints run here too.
4. Final scorers, with the sandbox still up, so they can run commands in it.
5. `unmount`, into the run's candidate directory. The snapshot, the dashboard and later judges read that copy. A failed `unmount` errors the run: its scores are kept, its workspace is marked unrecovered.
6. `stop({ keep })`: `keep` when the run did not pass and the project keeps sandboxes of failed runs, as for workspaces today.
7. After the invocation's last run, `teardown`.

A cancelled or limited run goes through 4 to 6 as well, so what it left is scored and kept. On a hard exit, `stop` is not called; the process sweep from 0.11.2 still covers the local kinds.

### Built-in kinds

| Kind                                                                | `mount`                                                                                           | `unmount`                                                 | Notes                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `host()`                                                            | Uses the directory in place                                                                       | Nothing to do                                             | The default. No isolation.                                                                                                        |
| `container({ image \| dockerfile, network, env, mounts, runtime })` | Creates the container with the workspace bind-mounted at `/workspace` and home at `/evalkit-home` | Nothing to do: the bind mount already wrote the host copy | `prepare` builds the Dockerfile once. `start` is cheap; the container is created at `mount`, since volumes are fixed at creation. |

A remote kind copies in `mount` and back in `unmount`. Nothing in EvalKit assumes the workspace is on the host between the two.

### Choosing a run's sandbox

The first of these that is set wins:

1. the matrix cell's `sandbox` parameter, a name from `sandboxes`;
2. the scenario's `sandbox`, a definition or a name;
3. the config's `sandbox`;
4. `host()`.

An unknown name is an error before any run starts, listing the names. A sandbox defined in a scenario file but missing from `sandboxes` is still usable by that scenario; `sandboxes` is only needed for picking by name.

### Concurrency

The runner keeps a queue per sandbox. A run starts when the invocation has a free slot (`--concurrency`) and its sandbox does (`concurrency`, unlimited by default; `container()` defaults to the machine's CPU count). With remote sandboxes, `-j 50` means fifty runs at once.

### Fixtures

Fixtures still start on the host (RFD0009). Each run gets them as its sandbox reaches them: the session's `fixtures` when it sets them, otherwise the host addresses. A container on `network: 'fixtures'` gets `fixtures.<name>`, as today. A remote sandbox reaches the host only if it is exposed to it (a tunnel), so a remote kind either maps the addresses or leaves them out. A scenario that needs a fixture its sandbox cannot reach fails at `start`, saying so.

### No policy

EvalKit runs the agent inside the sandbox and does not restrict it further: no allowed commands, no tool permissions, no check of what it touched. The sandbox's own definition (a container's image and network, a remote machine) is what isolates the run. A run that damages its workspace is scored on what is left.

### Removed

- `AutAdapter.runtimes`, `AgentRuntime`, `AgentRuntimes`, `AgentRuntimeName`, `agentRuntimes()`, `DEFAULT_AGENT_RUNTIMES`.
- `runEval`/`runMatrix` option `runtime`, the CLI's `--local`, and `runtimes` in the catalog.
- The config's `isolation` key, replaced by `sandboxes` and `sandbox`.
- `sandboxExec()` and its `sandbox-exec` shell (the generated profile, the supervisor, `allow`/`read`/`deny`/`env`). A run that needs isolation without containers uses a remote sandbox.
- `context.runtime` and the `runtime` argument to `start()`.

### Manifest

`RunMetadata.sandbox`: `{ id, kind, image?, network? }`, no host paths, replacing `isolation` and `runtime`. The run page shows it where it shows isolation now.

## Data migration and compatibility

`evalkit upgrade` (schema 8):

- `isolation: { kind: 'container', image, network }` becomes `sandbox: { id: 'container', kind: 'container', image, network }`;
- `none` becomes `host`;
- `sandbox-exec` is kept as `{ id: 'sandbox-exec', kind: 'sandbox-exec' }`, a record of how an old run ran, with nothing to run it again;
- `runtime` is dropped.

The share server does the same for stored and incoming runs. Projects change `isolation: container(...)` to `sandbox: container(...)`, or name it in `sandboxes`; the CHANGELOG migration guide says how.

## Rollout

1. Move `none()` and `container()` behind `defineSandbox` as `host()` and `container()`, and delete `sandboxExec()`, with `mount` and `unmount`, and choose a run's sandbox from the config. Same behaviour as 0.11 for hosts and containers.
2. Per-scenario `sandbox`, named `sandboxes`, the matrix axis, and per-sandbox concurrency.
3. Remove `runtimes` and `isolation`, with the upgrade.
4. A remote sandbox against a real service as the first user, to test the interface: a Cloudflare Sandbox or pi-durable on a Durable Object. It may stay an example rather than a built-in.

## Drawbacks

- One more concept for small projects. `host()` as the default keeps it invisible until needed.
- Copying workspaces in and out of remote sandboxes costs time for large workspaces; `workspace.ignore` (RFD0007) should apply to the upload too.
- Final scorers that run commands only work while the sandbox is up; a remote sandbox must keep its shell usable until `unmount`.

## Alternatives

- **Isolation per agent, not per scenario.** The machine a run needs depends on the task as much as the agent. An agent can still export a sandbox scenarios reuse.
- **Mount by bind only.** Works for local kinds, not remote ones. `mount`/`unmount` lets each kind choose.
- **Keep `runtimes` beside sandboxes.** Two names for where an agent runs, one of which does nothing.

## Prior art

- Harbor and Inspect run each task in a container defined per task.
- The Cloudflare Sandbox SDK and similar services run commands and hold files in a remote machine with an API close to `Shell`.

## Unresolved questions

- How a remote sandbox authenticates (a token in its definition, read from the environment on the host, never passed to the agent) is up to its definition; the example should show Cloudflare Access.
- Whether `container()` keeps the bind mount, or copies in and out like a remote kind, so a run cannot write to the host through a symlink.
- Whether the dashboard can start runs in remote sandboxes, or only `evalkit run`.

## Future possibilities

- Built-in remote kinds for Cloudflare Sandboxes and Durable Objects.
- Fixtures that run in the sandbox, or next to a remote one.
- Snapshotting a prepared sandbox (a warm image or a hibernated Durable Object) so `start` is instant.
