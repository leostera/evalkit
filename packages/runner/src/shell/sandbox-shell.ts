import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type {
  SandboxExecIsolation,
  ShellExit,
  ShellOptions,
  ShellProcess,
} from '@evalkit/core';
import { argv, type ClosableShell } from './host-shell.js';
import {
  OutputBuffer,
  ProcessTracker,
  signalExitCode,
  STOP_GRACE_MS,
} from './local-process.js';
import { insideWorkspace, workspaceFiles } from './workspace-files.js';

/**
 * Runs inside the sandbox and starts every command of the run as its
 * child, so all of them share one sandbox: a later command may signal a
 * server an earlier one started, and nothing outside. Plain JavaScript, so
 * Node and Bun both run it. One JSON message per line each way.
 */
const SUPERVISOR = `import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const children = new Map();
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
const signal = (child, name) => {
  try { process.kill(-child.pid, name); } catch { try { child.kill(name); } catch {} }
};
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.op === 'kill') {
    const child = children.get(message.id);
    if (child) signal(child, message.signal);
    return;
  }
  let child;
  try {
    child = spawn(message.argv[0], message.argv.slice(1), {
      cwd: message.cwd, env: message.env, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    send({ id: message.id, stream: 'stderr', data: String(error.message) + '\\n' });
    send({ id: message.id, exit: 127 });
    return;
  }
  children.set(message.id, child);
  send({ id: message.id, pid: child.pid });
  child.stdout.setEncoding('utf8').on('data', (data) => send({ id: message.id, stream: 'stdout', data }));
  child.stderr.setEncoding('utf8').on('data', (data) => send({ id: message.id, stream: 'stderr', data }));
  child.on('error', (error) => {
    send({ id: message.id, stream: 'stderr', data: message.argv[0] + ': ' + error.message + '\\n' });
    send({ id: message.id, exit: 127 });
  });
  child.on('close', (code, name) => {
    children.delete(message.id);
    send({ id: message.id, exit: code, signal: name });
  });
  child.stdin.on('error', () => {});
  child.stdin.end(message.input ?? '');
});
process.stdin.on('end', () => {
  for (const child of children.values()) signal(child, 'SIGKILL');
  process.exit(0);
});
`;

const real = (file: string) => {
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};
const quote = (file: string) => JSON.stringify(real(file));

/**
 * The `sandbox-exec` profile for one run. Everything is allowed but
 * reading or writing the project, the home directory and the other runs'
 * workspaces, and signalling processes outside the sandbox; the run's own
 * workspace and `allow` stay usable. Later rules win.
 */
export function sandboxProfile(options: {
  workspace: string;
  projectRoot: string;
  allow: readonly string[];
  /** Files the supervisor needs: its runtime and its script. */
  readable: readonly string[];
}): string {
  // <sandboxDir>/<run>/candidate: every run's workspaces, and this run's evaluator one.
  const runs = path.dirname(path.dirname(options.workspace));
  const denied = [options.projectRoot, homedir(), runs]
    .map((file) => `(subpath ${quote(file)})`)
    .join(' ');
  const usable = [options.workspace, ...options.allow]
    .map((file) => `(subpath ${quote(file)})`)
    .join(' ');
  const readable = options.readable
    .map((file) => `(literal ${quote(file)})`)
    .join(' ');
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-read* file-write* ${denied})`,
    `(allow file-read* file-write* ${usable})`,
    ...(readable ? [`(allow file-read* ${readable})`] : []),
    // Listing the directories on the way to the workspace is harmless, and tools expect it.
    '(allow file-read-metadata)',
    '(deny signal)',
    '(allow signal (target same-sandbox))',
  ].join('\n');
}

/** Writes the supervisor script once, where the sandbox can read it. */
async function supervisorScript(): Promise<string> {
  const hash = createHash('sha256')
    .update(SUPERVISOR)
    .digest('hex')
    .slice(0, 12);
  const file = path.join(tmpdir(), `evalkit-supervisor-${hash}.mjs`);
  await writeFile(file, SUPERVISOR);
  return file;
}

type Message =
  | { id: number; pid: number }
  | { id: number; stream: 'stdout' | 'stderr'; data: string }
  | { id: number; exit: number | null; signal?: string | null };

/**
 * macOS `sandbox-exec` isolation: one sandboxed supervisor per run, which
 * starts every command the run sends it.
 */
export async function sandboxShell(options: {
  isolation: SandboxExecIsolation;
  root: string;
  projectRoot: string;
  signal: AbortSignal;
}): Promise<ClosableShell> {
  if (process.platform !== 'darwin')
    throw new Error(
      'sandboxExec() isolation needs macOS sandbox-exec; use container() on other systems',
    );
  const script = await supervisorScript();
  const profile = sandboxProfile({
    workspace: real(options.root),
    projectRoot: real(options.projectRoot),
    allow: options.isolation.allow.map((file) =>
      path.resolve(options.projectRoot, file),
    ),
    readable: [process.execPath, script],
  });
  const supervisor = spawn(
    'sandbox-exec',
    ['-p', profile, process.execPath, script],
    { cwd: options.root, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let supervisorError = '';
  supervisor.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    supervisorError = (supervisorError + chunk).slice(-2_000);
  });
  const handlers = new Map<number, (message: Message) => void>();
  createInterface({ input: supervisor.stdout }).on('line', (line) => {
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      return;
    }
    handlers.get(message.id)?.(message);
  });
  const gone = new Promise<void>((resolve) =>
    supervisor.on('close', () => resolve()),
  );
  void gone.then(() => {
    // Commands still running when the supervisor died will never report.
    for (const handler of handlers.values())
      handler({
        id: -1,
        stream: 'stderr',
        data: `The run's sandbox stopped: ${supervisorError.trim()}\n`,
      });
    for (const [id, handler] of handlers) handler({ id, exit: 126 });
  });
  const send = (message: object) => {
    if (supervisor.stdin.writable)
      supervisor.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const tracker = new ProcessTracker();
  let commands = 0;
  const start = (
    command: string | readonly string[],
    commandOptions: ShellOptions = {},
  ): ShellProcess => {
    const id = ++commands;
    const stdout = new OutputBuffer();
    const stderr = new OutputBuffer();
    const listeners = new Set<
      (chunk: string, stream: 'stdout' | 'stderr') => void
    >();
    let pid: number | undefined;
    let timedOut = false;
    let resolveExit!: (exit: ShellExit) => void;
    const exit = new Promise<ShellExit>((resolve) => {
      resolveExit = resolve;
    });
    let exited = false;
    const kill = async (signal: string) => {
      if (!exited) send({ op: 'kill', id, signal });
    };
    const stop = async () => {
      await kill('SIGTERM');
      const timer = setTimeout(() => void kill('SIGKILL'), STOP_GRACE_MS);
      timer.unref?.();
      await exit;
      clearTimeout(timer);
    };
    const onAbort = () => void stop();
    const signal = commandOptions.signal ?? options.signal;
    const timer =
      commandOptions.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            void stop();
          }, commandOptions.timeoutMs);
    timer?.unref?.();
    handlers.set(id, (message) => {
      if ('pid' in message) pid = message.pid;
      else if ('stream' in message) {
        (message.stream === 'stdout' ? stdout : stderr).append(message.data);
        for (const listener of listeners)
          listener(message.data, message.stream);
      } else if ('exit' in message && !exited) {
        exited = true;
        handlers.delete(id);
        signal.removeEventListener('abort', onAbort);
        if (timer) clearTimeout(timer);
        const result: ShellExit = message.signal
          ? { exitCode: signalExitCode(message.signal), signal: message.signal }
          : { exitCode: message.exit ?? 0 };
        resolveExit(
          timedOut ? { ...result, exitCode: 124, timedOut: true } : result,
        );
      }
    });
    send({
      op: 'spawn',
      id,
      argv: argv(command),
      cwd: insideWorkspace(options.root, commandOptions.cwd),
      env: { ...process.env, ...commandOptions.env },
      ...(commandOptions.input !== undefined
        ? { input: commandOptions.input }
        : {}),
    });
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    return tracker.track({
      get pid() {
        return pid;
      },
      stdout: () => stdout.toString(),
      stderr: () => stderr.toString(),
      onOutput(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      wait: () => exit,
      kill: async (name = 'SIGTERM') => kill(name),
    });
  };

  return {
    isolation: 'sandbox-exec',
    root: options.root,
    exec: async (command, commandOptions) => {
      const started = start(command, commandOptions);
      const result = await started.wait();
      return { ...result, stdout: started.stdout(), stderr: started.stderr() };
    },
    spawn: (command, commandOptions) => start(command, commandOptions),
    ...workspaceFiles(options.root),
    async close() {
      await tracker.close();
      // Closing its input makes the supervisor stop whatever is left, then exit.
      supervisor.stdin.end();
      const timer = setTimeout(() => supervisor.kill('SIGKILL'), STOP_GRACE_MS);
      timer.unref?.();
      await gone;
      clearTimeout(timer);
    },
  };
}
