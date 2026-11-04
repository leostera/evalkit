import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type {
  ContainerIsolation,
  ShellOptions,
  ShellProcess,
} from '@evalkit/core';
import { docker, ensureRuntime, resolveImage } from './docker.js';
import type { ClosableShell } from './host-shell.js';
import {
  collect,
  ProcessTracker,
  startLocalProcess,
  type LocalProcess,
} from './local-process.js';
import { shellFiles } from './workspace-files.js';

/** Where the candidate workspace is inside the container. */
export const CONTAINER_WORKSPACE = '/workspace';
/** Where the run's private home is mounted. */
export const CONTAINER_HOME = '/evalkit-home';

/** Where each command records its process ID, so `kill` can reach it. */
const PID_DIR = '/tmp/.evalkit';

export type ContainerShellOptions = {
  isolation: ContainerIsolation;
  runId: string;
  /** The candidate workspace on the host, mounted at `/workspace`. */
  root: string;
  /** The run's private home on the host, mounted at `/evalkit-home`. */
  home: string;
  projectRoot: string;
  signal: AbortSignal;
  /** The fixtures' internal network, for `network: 'fixtures'`. */
  fixturesNetwork?: string;
};

export type ContainerShell = ClosableShell & {
  /** The container's name. */
  readonly container: string;
  /** Stops the processes, then removes the container, or only stops it to keep it. */
  close(options?: { keep?: boolean }): Promise<void>;
};

/** The container's name for a run. */
export function containerName(runId: string): string {
  return `evalkit-${runId.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
}

/** Removes a run's kept container, if there is one; true when it removed one. */
export async function removeRunContainer(
  runId: string,
  runtime = 'docker',
): Promise<boolean> {
  return docker(runtime, ['rm', '--force', containerName(runId)]).then(
    () => true,
    () => false,
  );
}

/** Arguments for `docker run`: everything but the image and its command. */
export function containerRunArgs(options: {
  isolation: ContainerIsolation;
  name: string;
  runId: string;
  workspace: string;
  home: string;
  fixturesNetwork?: string;
}): string[] {
  const { isolation } = options;
  const network =
    isolation.network === 'none'
      ? ['--network', 'none']
      : isolation.network === 'fixtures'
        ? ['--network', options.fixturesNetwork ?? 'none']
        : // The host, and fixtures on it, as host.docker.internal.
          ['--add-host', 'host.docker.internal:host-gateway'];
  // On Linux, files the run writes stay the user's, not root's.
  const user =
    process.platform === 'linux' && process.getuid && process.getgid
      ? ['--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp']
      : [];
  return [
    'run',
    '--detach',
    '--init',
    '--name',
    options.name,
    '--label',
    `evalkit.run=${options.runId}`,
    '--volume',
    `${options.workspace}:${CONTAINER_WORKSPACE}`,
    '--volume',
    `${options.home}:${CONTAINER_HOME}`,
    '--workdir',
    CONTAINER_WORKSPACE,
    ...network,
    ...user,
    ...isolation.env.flatMap((name) => ['--env', name]),
    ...isolation.mounts.flatMap((mount) => [
      '--volume',
      `${path.resolve(mount.host)}:${mount.path}:ro`,
    ]),
    '--entrypoint',
    'sh',
  ];
}

/**
 * The run's container, started before the session: its own process table
 * and filesystem, the candidate workspace bind-mounted read-write, the
 * evaluator workspace never mounted. Commands run in it with `exec`.
 */
export async function containerShell(
  options: ContainerShellOptions,
): Promise<ContainerShell> {
  const { isolation } = options;
  const runtime = isolation.runtime;
  await ensureRuntime(runtime);
  const image = await resolveImage(
    runtime,
    isolation.image,
    options.projectRoot,
  );
  const name = containerName(options.runId);
  const workspace = await realpath(options.root);
  await docker(runtime, [
    ...containerRunArgs({
      isolation,
      name,
      runId: options.runId,
      workspace,
      home: await realpath(options.home),
      ...(options.fixturesNetwork
        ? { fixturesNetwork: options.fixturesNetwork }
        : {}),
    }),
    image,
    '-c',
    `mkdir -p ${PID_DIR}; trap 'exit 0' TERM; while :; do sleep 3600 & wait $!; done`,
  ]);

  const tracker = new ProcessTracker();
  const clients = new Set<LocalProcess>();
  let commands = 0;
  const start = (
    command: string | readonly string[],
    commandOptions: ShellOptions = {},
  ): ShellProcess => {
    const id = ++commands;
    const pidFile = `${PID_DIR}/${id}.pid`;
    const program =
      typeof command === 'string' ? ['sh', '-c', command] : [...command];
    if (!program.length) throw new Error('A command needs a program to run');
    const cwd = path.posix.join(CONTAINER_WORKSPACE, commandOptions.cwd ?? '.');
    if (
      cwd !== CONTAINER_WORKSPACE &&
      !cwd.startsWith(`${CONTAINER_WORKSPACE}/`)
    )
      throw new Error(`${commandOptions.cwd} is outside the run's workspace`);
    // docker exec does not pass signals on, so `kill` signals the process inside.
    const signalInside = async (signal: string) => {
      const name_ = signal.replace(/^SIG/, '');
      await docker(runtime, [
        'exec',
        name,
        'sh',
        '-c',
        `p=$(cat ${pidFile} 2>/dev/null) && { kill -s ${name_} -- -$p 2>/dev/null || kill -s ${name_} $p; }`,
      ]).catch(() => undefined);
    };
    const started = startLocalProcess(
      [
        runtime,
        'exec',
        '--interactive',
        '--workdir',
        cwd,
        ...Object.entries(commandOptions.env ?? {}).flatMap(([key, value]) => [
          '--env',
          `${key}=${value}`,
        ]),
        name,
        'sh',
        '-c',
        `echo $$ > ${pidFile}; exec "$@"`,
        'sh',
        ...program,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        signal: commandOptions.signal ?? options.signal,
        ...(commandOptions.timeoutMs !== undefined
          ? { timeoutMs: commandOptions.timeoutMs }
          : {}),
        ...(commandOptions.input !== undefined
          ? { input: commandOptions.input }
          : {}),
        kill: signalInside,
      },
    );
    clients.add(started);
    void started.wait().then(() => clients.delete(started));
    let pid: number | undefined;
    void (async () => {
      // The command writes its PID as it starts; ask until it has.
      for (let attempt = 0; attempt < 20 && pid === undefined; attempt++) {
        const text = await docker(runtime, [
          'exec',
          name,
          'cat',
          pidFile,
        ]).catch(() => '');
        const parsed = Number.parseInt(text, 10);
        if (Number.isInteger(parsed)) pid = parsed;
        else await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })();
    const process_: ShellProcess = {
      get pid() {
        return pid;
      },
      stdout: started.stdout,
      stderr: started.stderr,
      onOutput: started.onOutput,
      wait: started.wait,
      kill: started.kill,
    };
    return tracker.track(process_);
  };

  return {
    isolation: 'container',
    root: CONTAINER_WORKSPACE,
    container: name,
    exec: async (command, commandOptions) =>
      collect(start(command, commandOptions)),
    spawn: (command, commandOptions) => start(command, commandOptions),
    ...shellFiles({
      root: options.root,
      seenRoot: CONTAINER_WORKSPACE,
      home: options.home,
      seenHome: CONTAINER_HOME,
    }),
    async close({ keep = false } = {}) {
      // Removing the container stops everything in it; the exec clients follow.
      await docker(
        runtime,
        keep ? ['stop', '--time', '2', name] : ['rm', '--force', name],
      ).catch(() => undefined);
      // With the container gone, nothing inside answers a signal: stop the clients here.
      for (const client of clients) await client.killLocal('SIGKILL');
      await tracker.close();
    },
  };
}
