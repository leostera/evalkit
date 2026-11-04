import { mkdir } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import {
  HOST_SANDBOX,
  type FixtureAddress,
  type JsonObject,
  type RunSandbox,
  type Sandbox,
  type SandboxLifecycle,
  type SandboxSession,
  type SandboxShell,
  type Shell,
} from '@evalkit/core';
import {
  CONTAINER_HOME,
  CONTAINER_WORKSPACE,
  containerShell,
  type ContainerSandbox,
} from './container-shell.js';
import { ensureRuntime, resolveImage } from './docker.js';
import type { FixtureSet } from './fixtures.js';
import { hostShell, type ClosableShell } from './host-shell.js';

export { fixtureSet, type FixtureSet } from './fixtures.js';
export { removeRunContainer } from './container-shell.js';

/**
 * The run's sandbox: the first of the matrix cell's `sandbox` parameter, the
 * scenario's `sandbox` and the config's, or this machine.
 */
export function resolveSandbox(options: {
  parameters?: JsonObject;
  scenario?: Sandbox | string;
  fallback?: Sandbox | string;
  sandboxes?: Readonly<Record<string, Sandbox>>;
}): Sandbox {
  const sandboxes = options.sandboxes ?? {};
  const byName = (name: string, from: string) => {
    const found = sandboxes[name];
    if (!found)
      throw new Error(
        `${from} names the sandbox ${JSON.stringify(name)}, which is not in the config's sandboxes (${Object.keys(sandboxes).join(', ') || 'none'})`,
      );
    return found;
  };
  const cell = options.parameters?.sandbox;
  if (cell !== undefined) {
    if (typeof cell !== 'string')
      throw new Error(
        `The sandbox parameter names a sandbox; received ${JSON.stringify(cell)}`,
      );
    return byName(cell, 'The sandbox parameter');
  }
  for (const [chosen, from] of [
    [options.scenario, 'The scenario'],
    [options.fallback, "The config's sandbox"],
  ] as const) {
    if (chosen === undefined) continue;
    return typeof chosen === 'string' ? byName(chosen, from) : chosen;
  }
  return HOST_SANDBOX;
}

/**
 * The sandboxes of one invocation: each prepared once before its first run
 * and torn down after the last, with at most its `concurrency` runs at once.
 */
export type SandboxSet = {
  prepare(sandbox: Sandbox, signal: AbortSignal): Promise<void>;
  /** Waits for a free slot in the sandbox; resolves to the function that frees it. */
  acquire(sandbox: Sandbox): Promise<() => void>;
  /** The image a container sandbox's runs start from, once prepared. */
  image(sandbox: ContainerSandbox): string;
  teardown(): Promise<void>;
};

export function sandboxSet(options: { root: string }): SandboxSet {
  const prepared = new Map<
    string,
    { sandbox: Sandbox; ready: Promise<void> }
  >();
  const images = new Map<string, string>();
  const slots = new Map<string, { free: number; waiting: (() => void)[] }>();
  const limit = (sandbox: Sandbox) =>
    sandbox.concurrency ??
    (sandbox.kind === 'container' ? availableParallelism() : Infinity);
  return {
    prepare(sandbox, signal) {
      const existing = prepared.get(sandbox.id);
      if (existing) {
        if (existing.sandbox !== sandbox)
          return Promise.reject(
            new Error(
              `Two different sandboxes have the id ${JSON.stringify(sandbox.id)}`,
            ),
          );
        return existing.ready;
      }
      const ready = (async () => {
        if (sandbox.kind === 'container') {
          await ensureRuntime(sandbox.runtime);
          images.set(
            sandbox.id,
            await resolveImage(sandbox.runtime, sandbox, options.root),
          );
        } else if (sandbox.kind === 'remote')
          await sandbox.prepare?.({ root: options.root, signal });
      })();
      prepared.set(sandbox.id, { sandbox, ready });
      return ready;
    },
    async acquire(sandbox) {
      let slot = slots.get(sandbox.id);
      if (!slot) {
        slot = { free: limit(sandbox), waiting: [] };
        slots.set(sandbox.id, slot);
      }
      const held = slot;
      if (held.free > 0) held.free -= 1;
      else await new Promise<void>((resolve) => held.waiting.push(resolve));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const next = held.waiting.shift();
        if (next) next();
        else held.free += 1;
      };
    },
    image(sandbox) {
      const image = images.get(sandbox.id);
      if (!image) throw new Error(`The sandbox ${sandbox.id} was not prepared`);
      return image;
    },
    async teardown() {
      const errors: unknown[] = [];
      for (const { sandbox, ready } of prepared.values()) {
        if (sandbox.kind !== 'remote' || !sandbox.teardown) continue;
        // Only a sandbox that was prepared is torn down.
        if (
          !(await ready.then(
            () => true,
            () => false,
          ))
        )
          continue;
        await sandbox.teardown().catch((error: unknown) => errors.push(error));
      }
      prepared.clear();
      if (errors.length) throw errors[0];
    },
  };
}

/** A run's sandbox, mounted, and how to end it. */
export type RunSandboxHandle = {
  shell: Shell;
  fixtures: Record<string, FixtureAddress>;
  /** What the manifest records about it. */
  record: RunSandbox;
  /** Brings the workspace back to the host; the shell still works until `stop`. */
  unmount(): Promise<void>;
  /** `keep` keeps it (a container, stopped) for a run that did not pass. */
  stop(options: { keep: boolean }): Promise<void>;
};

/**
 * Prepares the run's sandbox if it is the first run in it, starts it, and
 * mounts the run's candidate workspace in it. The project's fixtures start
 * first when there are any.
 */
export async function openRunSandbox(options: {
  sandbox: Sandbox;
  sandboxes: SandboxSet;
  runId: string;
  evalId: string;
  parameters: JsonObject;
  /** The candidate workspace on the host. */
  root: string;
  /** Cancels the sandbox's start and stop: the invocation's, not the agent's. */
  signal: AbortSignal;
  /** The default for a command given none: the run's while the agent works, cancellation's while scoring. */
  commandSignal?: () => AbortSignal;
  fixtures?: FixtureSet;
}): Promise<RunSandboxHandle> {
  const { sandbox } = options;
  await options.fixtures?.ensure();
  await options.sandboxes.prepare(sandbox, options.signal);
  const hostFixtures = options.fixtures?.addresses() ?? {};
  const lifecycle: SandboxLifecycle =
    sandbox.kind === 'remote'
      ? sandbox
      : sandbox.kind === 'container'
        ? containerLifecycle(sandbox, options.sandboxes, options.fixtures)
        : hostLifecycle();
  const session = await lifecycle.start({
    runId: options.runId,
    evalId: options.evalId,
    parameters: options.parameters,
    fixtures: hostFixtures,
    signal: options.signal,
  });
  const workspace = { root: options.root };
  let mounted: { root: string; home: string };
  try {
    mounted = await session.mount(workspace);
  } catch (error) {
    await session.stop({ keep: false }).catch(() => undefined);
    throw error;
  }
  return {
    shell: runShell(
      session.shell,
      sandbox,
      mounted,
      options.commandSignal ?? (() => options.signal),
    ),
    fixtures: session.fixtures ?? hostFixtures,
    record: runSandboxRecord(sandbox),
    unmount: () => session.unmount(workspace),
    stop: (stopOptions) => session.stop(stopOptions),
  };
}

/** The sandbox as a run's manifest records it: no host paths, no environment. */
export function runSandboxRecord(sandbox: Sandbox): RunSandbox {
  return {
    id: sandbox.id,
    kind: sandbox.kind,
    ...(sandbox.kind === 'container'
      ? {
          ...(sandbox.image ? { image: sandbox.image } : {}),
          ...(sandbox.dockerfile ? { dockerfile: sandbox.dockerfile } : {}),
          network: sandbox.network,
        }
      : {}),
  };
}

/** The shell `context.shell` is: the sandbox's, with where the run is in it. */
function runShell(
  shell: SandboxShell,
  sandbox: Sandbox,
  mounted: { root: string; home: string },
  defaultSignal: () => AbortSignal,
): Shell {
  return {
    sandbox: { id: sandbox.id, kind: sandbox.kind },
    root: mounted.root,
    home: mounted.home,
    exec: (command, options) =>
      shell.exec(command, {
        ...options,
        signal: options?.signal ?? defaultSignal(),
      }),
    spawn: (command, options) =>
      shell.spawn(command, {
        ...options,
        signal: options?.signal ?? defaultSignal(),
      }),
    readFile: (file) => shell.readFile(file),
    writeFile: (file, content) => shell.writeFile(file, content),
    list: (directory) => shell.list(directory),
  };
}

/** A shell whose commands go to `current()`, which exists once mounted. */
function mountedShell(current: () => ClosableShell | undefined): SandboxShell {
  const shell = () => {
    const opened = current();
    if (!opened) throw new Error('The sandbox is not mounted');
    return opened;
  };
  return {
    exec: (command, options) => shell().exec(command, options),
    spawn: (command, options) => shell().spawn(command, options),
    readFile: (file) => shell().readFile(file),
    writeFile: (file, content) => shell().writeFile(file, content),
    list: (directory) => shell().list(directory),
  };
}

/** `<run>/candidate` is the workspace; `<run>/home` is the run's private home beside it. */
async function homeBeside(workspace: string): Promise<string> {
  const home = path.join(path.dirname(workspace), 'home');
  await mkdir(home, { recursive: true });
  return home;
}

/** This machine: the workspace used in place, nothing to copy back. */
function hostLifecycle(): SandboxLifecycle {
  return {
    async start(run) {
      let shell: ClosableShell | undefined;
      const session: SandboxSession = {
        shell: mountedShell(() => shell),
        async mount(workspace) {
          const home = await homeBeside(workspace.root);
          shell = hostShell({ root: workspace.root, home, signal: run.signal });
          return { root: workspace.root, home };
        },
        async unmount() {},
        async stop() {
          await shell?.close();
        },
      };
      return session;
    },
  };
}

/**
 * A container per run, created at `mount` with the workspace and home
 * bind-mounted, so there is nothing to copy back.
 */
function containerLifecycle(
  sandbox: ContainerSandbox,
  sandboxes: SandboxSet,
  fixtures: FixtureSet | undefined,
): SandboxLifecycle {
  return {
    async start(run) {
      let shell: Awaited<ReturnType<typeof containerShell>> | undefined;
      const fixturesNetwork =
        sandbox.network === 'fixtures' && fixtures
          ? await fixtures.network(sandbox.runtime)
          : undefined;
      const session: SandboxSession = {
        shell: mountedShell(() => shell),
        fixtures: fixtures?.addresses({ container: sandbox.network }) ?? {},
        async mount(workspace) {
          shell = await containerShell({
            sandbox,
            image: sandboxes.image(sandbox),
            runId: run.runId,
            root: workspace.root,
            home: await homeBeside(workspace.root),
            signal: run.signal,
            ...(fixturesNetwork ? { fixturesNetwork } : {}),
          });
          return { root: CONTAINER_WORKSPACE, home: CONTAINER_HOME };
        },
        async unmount() {},
        async stop({ keep }) {
          await shell?.close({ keep });
        },
      };
      return session;
    },
  };
}
