/**
 * Where a run's processes run, and the shell adapters and scorers use to
 * run them (RFD0009). Types and constructors only: the runner implements
 * them.
 */

/** Commands run on the host, in the run's workspace. The default. */
export type NoIsolation = { kind: 'none' };

/**
 * What a run's container can reach: nothing, only the project's fixtures,
 * or whatever the container runtime allows by default.
 */
export type ContainerNetwork = 'none' | 'fixtures' | 'full';

/** A host path mounted read-only into every run's container. */
export type ContainerMount = { host: string; path: string };

/** One container per run, from `image`, with the candidate workspace at `/workspace`. */
export type ContainerIsolation = {
  kind: 'container';
  /** An image reference (`node:22`), or a Dockerfile path relative to the project (`./evals/Dockerfile`). */
  image: string;
  network: ContainerNetwork;
  /** The `docker`-compatible command to run: `docker` (the default) or `podman`. */
  runtime: string;
  /** Names of host environment variables passed into the container; nothing else is. */
  env: readonly string[];
  mounts: readonly ContainerMount[];
};

/** macOS only: each run's processes run under a generated `sandbox-exec` profile. */
export type SandboxExecIsolation = {
  kind: 'sandbox-exec';
  /** Host paths the run may read and write besides its workspace, such as an agent CLI's install. */
  allow: readonly string[];
};

export type Isolation = NoIsolation | ContainerIsolation | SandboxExecIsolation;

export type ContainerOptions = {
  image: string;
  /** Default `'none'`. */
  network?: ContainerNetwork;
  runtime?: string;
  env?: readonly string[];
  /** `{ host, path }`, or `'host:path'`. */
  mounts?: readonly (ContainerMount | string)[];
};

const NETWORKS: readonly ContainerNetwork[] = ['none', 'fixtures', 'full'];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** No isolation: commands run on the host in the run's workspace. */
export function none(): NoIsolation {
  return { kind: 'none' };
}

/**
 * Container isolation through the `docker` CLI, or a compatible one such as
 * podman's: a container per run, the candidate workspace mounted at
 * `/workspace`, the evaluator workspace never mounted, and its own process
 * table, so a `pkill` reaches only that run.
 */
export function container(options: ContainerOptions): ContainerIsolation {
  if (typeof options?.image !== 'string' || !options.image.trim())
    throw new Error(
      'container() needs an image: a name such as node:22, or a Dockerfile path',
    );
  const network = options.network ?? 'none';
  if (!NETWORKS.includes(network))
    throw new Error(
      `container() network must be ${NETWORKS.join(', ')}; received ${String(network)}`,
    );
  const env = [...(options.env ?? [])];
  for (const name of env)
    if (!ENV_NAME.test(name))
      throw new Error(
        `container() env takes variable names, such as API_KEY; received ${JSON.stringify(name)}`,
      );
  const mounts = (options.mounts ?? []).map(parseMount);
  return {
    kind: 'container',
    image: options.image.trim(),
    network,
    runtime: options.runtime ?? 'docker',
    env,
    mounts,
  };
}

function parseMount(mount: ContainerMount | string): ContainerMount {
  const parsed =
    typeof mount === 'string'
      ? (() => {
          const at = mount.lastIndexOf(':');
          return at > 0
            ? { host: mount.slice(0, at), path: mount.slice(at + 1) }
            : undefined;
        })()
      : mount;
  if (!parsed?.host || !parsed.path?.startsWith('/'))
    throw new Error(
      `container() mounts take { host, path } with an absolute container path, or 'host:/path'; received ${JSON.stringify(mount)}`,
    );
  if (parsed.path === '/workspace' || parsed.path.startsWith('/workspace/'))
    throw new Error(
      `container() cannot mount over /workspace, the run's workspace: ${parsed.path}`,
    );
  return { host: parsed.host, path: parsed.path };
}

/**
 * macOS `sandbox-exec` isolation, for projects that cannot use containers:
 * the run cannot read or write the project, the home directory or other
 * runs' workspaces, except its own workspace and `allow`, and can signal
 * only processes it started.
 */
export function sandboxExec(
  options: { allow?: readonly string[] } = {},
): SandboxExecIsolation {
  return { kind: 'sandbox-exec', allow: [...(options.allow ?? [])] };
}

/**
 * A service runs reach, such as a fake store or API, started on the host
 * before the first run that needs it and stopped after the invocation's
 * last.
 */
export type Fixture = {
  /** The command that starts it, run with `sh -c` in the project root. */
  start: string;
  /** A URL polled until it answers, or a command that must exit 0. */
  ready?: string;
  /** A command run before the fixture is stopped. */
  stop?: string;
  /** The port it listens on; taken from `ready` when that is a URL with one. */
  port?: number;
};

/** A fixture as one run reaches it. */
export type FixtureAddress = {
  /** Where the run reaches it: `http://localhost:8787`, or `http://fixtures.<name>:8787` from a container. */
  url: string;
};

/** A process's exit: a signal shows as 128 plus its number, a timeout as 124. */
export type ShellExit = {
  exitCode: number;
  /** The signal that stopped it, if one did. */
  signal?: string;
  /** True when `timeoutMs` passed and the process was stopped. */
  timedOut?: true;
};

export type ShellResult = ShellExit & { stdout: string; stderr: string };

export type ShellOptions = {
  /** Relative to the workspace. */
  cwd?: string;
  /** Added to the environment the process gets. */
  env?: Readonly<Record<string, string>>;
  /** Stops the process when aborted. Default: the run's signal. */
  signal?: AbortSignal;
  /** Stops the process after this many milliseconds. */
  timeoutMs?: number;
  /** Written to the process's standard input, which is then closed. */
  input?: string;
};

/** A process started with `spawn`. Its output is always read, so it never blocks on a full pipe. */
export type ShellProcess = {
  /** Its process ID where it runs (inside the container, for container isolation). */
  readonly pid: number | undefined;
  /** Its standard output so far: the last megabyte. */
  stdout(): string;
  stderr(): string;
  /** Calls `listener` with each chunk of output as it arrives; returns a function that stops. */
  onOutput(
    listener: (chunk: string, stream: 'stdout' | 'stderr') => void,
  ): () => void;
  /** Resolves when it exits. */
  wait(): Promise<ShellExit>;
  /** Signals it and the processes it started. Default `SIGTERM`. */
  kill(signal?: string): Promise<void>;
};

/**
 * The run's shell: commands, long-lived processes and files, wherever the
 * run's isolation puts them. One per run, shared by the adapter and the
 * run's scorers; processes it started are stopped when the run ends. A
 * string command runs with `sh -c`; an array runs as it is.
 */
export type Shell = {
  readonly isolation: Isolation['kind'];
  /** The workspace as commands see it: its host path, or `/workspace` in a container. */
  readonly root: string;
  exec(
    command: string | readonly string[],
    options?: ShellOptions,
  ): Promise<ShellResult>;
  spawn(
    command: string | readonly string[],
    options?: Omit<ShellOptions, 'timeoutMs'>,
  ): ShellProcess;
  /** Relative to the workspace. */
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  /** A directory's entries, relative to the workspace; directories end with `/`. */
  list(path?: string): Promise<string[]>;
};
