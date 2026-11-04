import type { Shell, ShellOptions } from '@evalkit/core';
import {
  collect,
  forgetGroup,
  ProcessTracker,
  startLocalProcess,
} from './local-process.js';
import { insideWorkspace, workspaceFiles } from './workspace-files.js';

/** A string runs with `sh -c`; an array runs as it is. */
export function argv(command: string | readonly string[]): string[] {
  if (typeof command === 'string') return ['/bin/sh', '-c', command];
  if (!command.length) throw new Error('A command needs a program to run');
  return [...command];
}

export type HostShellOptions = {
  /** The candidate workspace on the host. */
  root: string;
  /** The run's signal, the default for every command. */
  signal: AbortSignal;
};

export type ClosableShell = Shell & {
  /** Stops every process the run started; the shell takes no more commands. */
  close(): Promise<void>;
};

/**
 * Commands on this machine, in the run's workspace, with the host's
 * environment: what adapters did before EvalKit had a shell. Each command
 * leads its own process group, and every group is stopped when the run
 * ends, background children included.
 */
export function hostShell(options: HostShellOptions): ClosableShell {
  const tracker = new ProcessTracker();
  const groups = new Set<number>();
  const start = (
    command: string | readonly string[],
    commandOptions: ShellOptions = {},
  ) => {
    const process_ = startLocalProcess(argv(command), {
      cwd: insideWorkspace(options.root, commandOptions.cwd),
      env: { ...process.env, ...commandOptions.env },
      signal: commandOptions.signal ?? options.signal,
      ...(commandOptions.timeoutMs !== undefined
        ? { timeoutMs: commandOptions.timeoutMs }
        : {}),
      ...(commandOptions.input !== undefined
        ? { input: commandOptions.input }
        : {}),
      // Its group may outlive it with background children, until close.
      forgetOnExit: false,
    });
    if (process_.pid !== undefined) groups.add(process_.pid);
    return tracker.track(process_);
  };
  return {
    isolation: 'none',
    root: options.root,
    exec: async (command, commandOptions) =>
      collect(start(command, commandOptions)),
    spawn: (command, commandOptions) => start(command, commandOptions),
    ...workspaceFiles(options.root),
    async close() {
      await tracker.close();
      // Children a finished command left running in its group.
      for (const group of groups) {
        try {
          process.kill(-group, 'SIGKILL');
        } catch {
          // The group is gone.
        }
        forgetGroup(group);
      }
    },
  };
}
