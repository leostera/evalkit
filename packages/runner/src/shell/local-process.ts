import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:os';
import type { ShellExit, ShellProcess } from '@evalkit/core';

/**
 * Process groups started here and not yet stopped. Each command leads its
 * own group, so the terminal's Ctrl+C no longer reaches it: when this
 * process exits, even at once on a second Ctrl+C, they are killed.
 */
const liveGroups = new Set<number>();
let exitHook = false;

/** Kills `group` when this process exits, until `forgetGroup`. */
export function rememberGroup(group: number): void {
  liveGroups.add(group);
  if (exitHook) return;
  exitHook = true;
  process.once('exit', () => {
    for (const pid of liveGroups)
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Gone already.
      }
  });
}

export function forgetGroup(group: number): void {
  liveGroups.delete(group);
}

/** Output kept per stream: the last megabyte, where errors are. */
const OUTPUT_LIMIT = 1_000_000;
/** How long a process gets to stop after SIGTERM before SIGKILL. */
export const STOP_GRACE_MS = 2_000;

export type LocalProcessOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  input?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * How to signal it. Default: its process group, which `spawn` makes it
   * lead, so the processes it started stop with it.
   */
  kill?: (signal: string) => Promise<void>;
  /**
   * Stop remembering its group when it exits. Default true; false for a
   * shell that stops a command's leftover children itself and calls
   * `forgetGroup` then.
   */
  forgetOnExit?: boolean;
};

/** A process's text output, keeping the last `OUTPUT_LIMIT` characters. */
export class OutputBuffer {
  #text = '';
  append(chunk: string): void {
    this.#text += chunk;
    if (this.#text.length > OUTPUT_LIMIT * 2)
      this.#text = this.#text.slice(-OUTPUT_LIMIT);
  }
  toString(): string {
    return this.#text.length > OUTPUT_LIMIT
      ? this.#text.slice(-OUTPUT_LIMIT)
      : this.#text;
  }
}

/** The exit code a shell reports for a signal: 128 plus its number. */
export function signalExitCode(signal: string): number {
  const number = constants.signals[signal as NodeJS.Signals];
  return 128 + (number ?? 15);
}

/** A process on this machine; `killLocal` signals its group here even when `kill` signals elsewhere. */
export type LocalProcess = ShellProcess & {
  killLocal(signal: string): Promise<void>;
};

/**
 * Starts a process on this machine, in its own process group, and reads its
 * output as it comes. A command that cannot start exits 127 with the reason
 * on stderr, as a shell would.
 */
export function startLocalProcess(
  argv: readonly string[],
  options: LocalProcessOptions,
): LocalProcess {
  const [program, ...args] = argv;
  if (!program) throw new Error('A command needs at least a program to run');
  const stdout = new OutputBuffer();
  const stderr = new OutputBuffer();
  const listeners = new Set<
    (chunk: string, stream: 'stdout' | 'stderr') => void
  >();
  const emit = (chunk: string, stream: 'stdout' | 'stderr') => {
    (stream === 'stdout' ? stdout : stderr).append(chunk);
    for (const listener of listeners) listener(chunk, stream);
  };
  let child: ChildProcess | undefined;
  let timedOut = false;
  let exited = false;
  let resolveExit!: (exit: ShellExit) => void;
  const exit = new Promise<ShellExit>((resolve) => {
    resolveExit = resolve;
  });
  const finish = (result: ShellExit) => {
    if (exited) return;
    exited = true;
    cleanup();
    resolveExit(
      timedOut ? { ...result, exitCode: 124, timedOut: true } : result,
    );
  };

  const signalGroup = async (signal: string) => {
    if (exited || child?.pid === undefined) return;
    try {
      process.kill(-child.pid, signal as NodeJS.Signals);
    } catch {
      try {
        child.kill(signal as NodeJS.Signals);
      } catch {
        // Already gone.
      }
    }
  };
  const kill = options.kill ?? signalGroup;
  /** SIGTERM, then SIGKILL if it is still running after the grace. */
  const stop = async () => {
    await kill('SIGTERM');
    const timer = setTimeout(() => void kill('SIGKILL'), STOP_GRACE_MS);
    timer.unref?.();
    await exit;
    clearTimeout(timer);
  };

  const onAbort = () => void stop();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    options.signal?.removeEventListener('abort', onAbort);
    if (timer) clearTimeout(timer);
  };

  try {
    child = spawn(program, args, {
      cwd: options.cwd,
      // Some programs (opencode) trust $PWD over their real directory.
      env: { ...options.env, PWD: options.cwd },
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    emit(`${errorMessage(error)}\n`, 'stderr');
    finish({ exitCode: 127 });
  }
  if (child) {
    const group = child.pid;
    if (group !== undefined) {
      rememberGroup(group);
      if (options.forgetOnExit !== false)
        void exit.then(() => forgetGroup(group));
    }
    child.stdout
      ?.setEncoding('utf8')
      .on('data', (chunk: string) => emit(chunk, 'stdout'));
    child.stderr
      ?.setEncoding('utf8')
      .on('data', (chunk: string) => emit(chunk, 'stderr'));
    child.on('error', (error) => {
      emit(`${program}: ${errorMessage(error)}\n`, 'stderr');
      finish({ exitCode: 127 });
    });
    child.on('close', (code, signal) =>
      finish(
        signal
          ? { exitCode: signalExitCode(signal), signal }
          : { exitCode: code ?? 0 },
      ),
    );
    child.stdin?.on('error', () => {
      // The process may exit before reading its input.
    });
    child.stdin?.end(options.input ?? '');
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        void stop();
      }, options.timeoutMs);
      timer.unref?.();
    }
  }

  return {
    get pid() {
      return child?.pid;
    },
    stdout: () => stdout.toString(),
    stderr: () => stderr.toString(),
    onOutput(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    wait: () => exit,
    async kill(signal = 'SIGTERM') {
      await kill(signal);
    },
    killLocal: signalGroup,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs a process to its end and returns its output. */
export async function collect(process: ShellProcess) {
  const exit = await process.wait();
  return { ...exit, stdout: process.stdout(), stderr: process.stderr() };
}

/**
 * The processes a run's shell started, so they stop when the run ends:
 * SIGTERM, then SIGKILL after a grace.
 */
export class ProcessTracker {
  readonly #live = new Set<ShellProcess>();
  #closed = false;

  track(process: ShellProcess): ShellProcess {
    if (this.#closed) {
      void process.kill('SIGKILL');
      throw new Error('The run is over: its shell takes no more commands');
    }
    this.#live.add(process);
    void process.wait().then(() => this.#live.delete(process));
    return process;
  }

  get closed(): boolean {
    return this.#closed;
  }

  async close(): Promise<void> {
    this.#closed = true;
    await Promise.all(
      [...this.#live].map(async (process) => {
        await process.kill('SIGTERM');
        const timer = setTimeout(
          () => void process.kill('SIGKILL'),
          STOP_GRACE_MS,
        );
        timer.unref?.();
        await process.wait();
        clearTimeout(timer);
      }),
    );
  }
}
