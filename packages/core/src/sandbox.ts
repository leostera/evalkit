/**
 * Sandboxes: where a run happens, the machine its agent runs on and its
 * workspace lives in (RFD0010). Types and `defineSandbox` only: the runner
 * drives them.
 */
import { markDefinitionSite } from './definition-site.js';
import type { JsonObject } from './index.js';

export type SandboxKind = 'host' | 'container' | 'remote';

/**
 * What a container can reach: nothing, only the project's fixtures, or
 * whatever the container runtime allows by default.
 */
export type ContainerNetwork = 'none' | 'fixtures' | 'full';

/** A host path mounted read-only into every run's container. */
export type ContainerMount = { host: string; path: string };

export type ContainerOptions = {
  /** Default `'none'`. */
  network?: ContainerNetwork;
  /** Names of host environment variables passed into the container; nothing else is. */
  env?: readonly string[];
  /** Read-only: `{ host, path }`, or `'host:path'`. */
  mounts?: readonly (ContainerMount | string)[];
  /** The `docker`-compatible command: `docker` (the default) or `podman`. */
  runtime?: string;
};

/** What EvalKit gives a sandbox for each run. */
export type SandboxRunContext = {
  runId: string;
  evalId: string;
  /** The matrix cell's parameters, or `{}`. */
  parameters: JsonObject;
  /** The project's fixtures, as the host reaches them. */
  fixtures: Record<string, FixtureAddress>;
  signal: AbortSignal;
};

/** One run's sandbox, from `start` to `stop`. */
export type SandboxSession = {
  /** Commands in the sandbox: `context.shell` for the agent and scorers, once mounted. */
  shell: SandboxShell;
  /**
   * Puts the run's workspace (a host directory) in the sandbox, and says
   * where it and the run's private home are there.
   */
  mount(workspace: { root: string }): Promise<{ root: string; home: string }>;
  /** Brings the workspace back into `workspace.root`, as the sandbox left it. */
  unmount(workspace: { root: string }): Promise<void>;
  /** Fixtures as the sandbox reaches them, when it reaches them differently from the host. */
  fixtures?: Record<string, FixtureAddress>;
  /** `keep` when the run did not pass and the project keeps failed runs' sandboxes. */
  stop(options: { keep: boolean }): Promise<void>;
};

/** What a remote sandbox implements. */
export type SandboxLifecycle = {
  /** Once per invocation, before its first run: build an image, deploy, warm up. */
  prepare?(context: { root: string; signal: AbortSignal }): Promise<void>;
  /** For each run. */
  start(run: SandboxRunContext): Promise<SandboxSession>;
  /** Once per invocation, after its last run. */
  teardown?(): Promise<void>;
};

type SandboxCommon = {
  /** Names it in `sandboxes`, matrix axes and run manifests. */
  id: string;
  /** At most this many runs in it at once; `--concurrency` still applies. */
  concurrency?: number;
};

export type SandboxDefinition = SandboxCommon &
  (
    | { kind: 'host' }
    | ({ kind: 'container'; containerOpts?: ContainerOptions } & (
        | { dockerfile: string; image?: never }
        | { image: string; dockerfile?: never }
      ))
    | ({ kind: 'remote' } & SandboxLifecycle)
  );

/** A checked sandbox, as returned by `defineSandbox`. */
export type Sandbox = SandboxCommon &
  (
    | { kind: 'host' }
    | {
        kind: 'container';
        /** A Dockerfile path relative to the project root, built once per invocation. */
        dockerfile?: string;
        /** A prebuilt image. */
        image?: string;
        network: ContainerNetwork;
        env: readonly string[];
        mounts: readonly ContainerMount[];
        runtime: string;
      }
    | ({ kind: 'remote' } & SandboxLifecycle)
  );

/** The sandbox a run gets when nothing names one: this machine, no isolation. */
export const HOST_SANDBOX: Sandbox = Object.freeze({
  id: 'host',
  kind: 'host',
});

const NETWORKS: readonly ContainerNetwork[] = ['none', 'fixtures', 'full'];
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SANDBOX_ID = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Defines where runs happen: `kind: 'host'` (this machine), `'container'`
 * (a container per run, from a `dockerfile` or a prebuilt `image`), or
 * `'remote'` (your own `start`, `mount`, `unmount` and `stop`).
 */
export function defineSandbox(definition: SandboxDefinition): Sandbox {
  const where = `defineSandbox(${JSON.stringify(definition?.id ?? '')})`;
  if (typeof definition?.id !== 'string' || !SANDBOX_ID.test(definition.id))
    throw new Error(
      `${where} needs an id of lowercase letters, digits, - and _, such as node`,
    );
  const concurrency = definition.concurrency;
  if (
    concurrency !== undefined &&
    !(Number.isInteger(concurrency) && concurrency > 0)
  )
    throw new Error(`${where} concurrency must be a positive whole number`);
  const common = {
    id: definition.id,
    ...(concurrency !== undefined ? { concurrency } : {}),
  };
  switch (definition.kind) {
    case 'host':
      return markDefinitionSite({ ...common, kind: 'host' });
    case 'container':
      return markDefinitionSite({
        ...common,
        kind: 'container',
        ...containerSource(definition, where),
        ...containerOptions(definition.containerOpts ?? {}, where),
      });
    case 'remote':
      if (typeof definition.start !== 'function')
        throw new Error(`${where} is remote, so it needs start(run)`);
      return markDefinitionSite({ ...definition, ...common, kind: 'remote' });
    default:
      throw new Error(
        `${where} kind must be host, container or remote; received ${JSON.stringify((definition as { kind?: unknown }).kind)}`,
      );
  }
}

function containerSource(
  definition: { dockerfile?: string; image?: string },
  where: string,
): { dockerfile: string } | { image: string } {
  const { dockerfile, image } = definition;
  if (
    typeof dockerfile === 'string' &&
    dockerfile.trim() &&
    image === undefined
  )
    return { dockerfile: dockerfile.trim() };
  if (typeof image === 'string' && image.trim() && dockerfile === undefined)
    return { image: image.trim() };
  throw new Error(
    `${where} is a container, so it needs exactly one of dockerfile (a path) and image (a prebuilt image)`,
  );
}

function containerOptions(options: ContainerOptions, where: string) {
  const network = options.network ?? 'none';
  if (!NETWORKS.includes(network))
    throw new Error(
      `${where} network must be ${NETWORKS.join(', ')}; received ${String(network)}`,
    );
  const env = [...(options.env ?? [])];
  for (const name of env)
    if (!ENV_NAME.test(name))
      throw new Error(
        `${where} env takes variable names, such as API_KEY; received ${JSON.stringify(name)}`,
      );
  return {
    network,
    env,
    mounts: (options.mounts ?? []).map((mount) => parseMount(mount, where)),
    runtime: options.runtime ?? 'docker',
  };
}

function parseMount(
  mount: ContainerMount | string,
  where: string,
): ContainerMount {
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
      `${where} mounts take { host, path } with an absolute container path, or 'host:/path'; received ${JSON.stringify(mount)}`,
    );
  for (const reserved of ['/workspace', '/evalkit-home'])
    if (parsed.path === reserved || parsed.path.startsWith(`${reserved}/`))
      throw new Error(
        `${where} cannot mount over ${reserved}, which the run uses: ${parsed.path}`,
      );
  return { host: parsed.host, path: parsed.path };
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
  /** Its process ID where it runs (inside the container, for a container sandbox). */
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
 * Commands, long-lived processes and files in a sandbox: what a sandbox's
 * session provides. A string command runs with `sh -c`; an array runs as
 * it is.
 */
export type SandboxShell = {
  exec(
    command: string | readonly string[],
    options?: ShellOptions,
  ): Promise<ShellResult>;
  spawn(
    command: string | readonly string[],
    options?: Omit<ShellOptions, 'timeoutMs'>,
  ): ShellProcess;
  /** Relative to the workspace, or absolute inside `root` or `home`. */
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  /** A directory's entries, relative to the workspace; directories end with `/`. */
  list(path?: string): Promise<string[]>;
};

/**
 * The run's shell, in its sandbox: one per run, shared by the adapter and
 * the run's scorers; processes it started are stopped when the run ends.
 */
export type Shell = SandboxShell & {
  /** The run's sandbox. */
  readonly sandbox: { id: string; kind: SandboxKind };
  /** The workspace as commands see it: its host path, or `/workspace` in a container. */
  readonly root: string;
  /**
   * The run's private directory, outside the workspace, as commands see it
   * (`/evalkit-home` in a container): for an agent CLI's config and session
   * files. It is never snapshotted, and is removed with the run.
   */
  readonly home: string;
};
