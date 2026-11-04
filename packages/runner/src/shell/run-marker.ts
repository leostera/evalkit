import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * The variable every command of a run carries. A process that leaves the
 * run's process groups (`setsid`, `nohup … &` in a new session) keeps its
 * environment, so the run can still find it, and stop it, when it ends.
 */
export const RUN_MARKER = 'EVALKIT_RUN_MARKER';

/** The environment every command of a host or sandboxed run starts with. */
export function runEnvironment(home: string): {
  /** Defaults a command's own `env` may override. */
  env: Record<string, string>;
  /** Set last, so a command cannot drop it by accident. */
  markerEnv: Record<string, string>;
  marker: string;
} {
  // Each run's own temporary directory, in its home: no run reads another's scratch files.
  const tmp = path.join(home, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const marker = randomUUID();
  return {
    env: { TMPDIR: tmp, TMP: tmp, TEMP: tmp },
    markerEnv: { [RUN_MARKER]: marker },
    marker,
  };
}

/** Runs whose processes are swept if this process exits before they close. */
const liveRuns = new Map<string, readonly string[]>();
let exitHook = false;

/**
 * Sweeps the run's processes when this process exits, however it exits,
 * until `untrackRun`: a signal or a second Ctrl+C never leaves them behind.
 */
export function trackRun(marker: string, directories: readonly string[]): void {
  liveRuns.set(marker, directories);
  if (exitHook) return;
  exitHook = true;
  process.once('exit', () => {
    for (const [live, liveDirectories] of liveRuns)
      kill([
        ...markedIn(listProcessesSync(), live),
        ...insideIn(listCwdsSync(), realRoots(liveDirectories)),
      ]);
  });
}

export function untrackRun(marker: string): void {
  liveRuns.delete(marker);
}

/**
 * Kills every process of this user still carrying the run's marker, or
 * working inside one of the run's directories. The second catches what
 * the first cannot see: macOS hides the environment of its own binaries.
 */
export async function killRunProcesses(
  marker: string,
  directories: readonly string[],
): Promise<number[]> {
  const [processes, cwds] = await Promise.all([listProcesses(), listCwds()]);
  const pids = kill([
    ...markedIn(processes, marker),
    ...insideIn(cwds, realRoots(directories)),
  ]);
  untrackRun(marker);
  return pids;
}

function kill(found: number[]): number[] {
  const pids = [...new Set(found)].filter((pid) => pid !== process.pid);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // It is gone.
    }
  }
  return pids;
}

/** Each process's ID with its environment (Linux) or command line and environment (macOS). */
type ProcessEnv = { pid: number; env: string[] };
/** Each process's ID with its working directory. */
type ProcessCwd = { pid: number; cwd: string };

function markedIn(processes: ProcessEnv[], marker: string): number[] {
  const needle = `${RUN_MARKER}=${marker}`;
  return processes
    .filter((entry) => entry.env.includes(needle))
    .map((entry) => entry.pid);
}

function insideIn(cwds: ProcessCwd[], roots: string[]): number[] {
  return cwds
    .filter(({ cwd }) =>
      roots.some(
        (root) => cwd === root || cwd.startsWith(`${root}${path.sep}`),
      ),
    )
    .map((entry) => entry.pid);
}

function realRoots(directories: readonly string[]): string[] {
  return directories.map((directory) => {
    try {
      return realpathSync(directory);
    } catch {
      return directory;
    }
  });
}

const PS_ARGS = ['-E', '-ww', '-A', '-o', 'pid=,command='];
const lsofArgs = () => [
  '-a',
  '-d',
  'cwd',
  '-u',
  String(process.getuid?.() ?? ''),
  '-Fpn',
];
const BUFFER = { maxBuffer: 64 * 1024 * 1024 };

/** `ps -E` appends each process's environment, for this user's processes. */
function parsePs(stdout: string): ProcessEnv[] {
  return stdout.split('\n').flatMap((line) => {
    const words = line.trim().split(/\s+/);
    const pid = Number.parseInt(words[0] ?? '', 10);
    return Number.isInteger(pid) ? [{ pid, env: words.slice(1) }] : [];
  });
}

/** `lsof -Fpn` prints `p<pid>` then `n<cwd>` for each process. */
function parseLsof(stdout: string): ProcessCwd[] {
  const entries: ProcessCwd[] = [];
  let pid: number | undefined;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number.parseInt(line.slice(1), 10);
    else if (line.startsWith('n') && pid !== undefined)
      entries.push({ pid, cwd: line.slice(1) });
  }
  return entries;
}

function procEntries(): string[] {
  try {
    return readdirSync('/proc').filter((entry) => /^\d+$/.test(entry));
  } catch {
    return [];
  }
}

function listProcessesSync(): ProcessEnv[] {
  if (process.platform === 'linux')
    return procEntries().flatMap((entry) => {
      try {
        const env = readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0');
        return [{ pid: Number(entry), env }];
      } catch {
        return [];
      }
    });
  try {
    return parsePs(
      execFileSync('ps', PS_ARGS, { ...BUFFER, encoding: 'utf8' }),
    );
  } catch {
    return [];
  }
}

function listCwdsSync(): ProcessCwd[] {
  if (process.platform === 'linux')
    return procEntries().flatMap((entry) => {
      try {
        return [
          { pid: Number(entry), cwd: readlinkSync(`/proc/${entry}/cwd`) },
        ];
      } catch {
        return [];
      }
    });
  try {
    return parseLsof(
      execFileSync('lsof', lsofArgs(), { ...BUFFER, encoding: 'utf8' }),
    );
  } catch (error) {
    // lsof exits 1 when some processes cannot be read; its output still counts.
    return parseLsof(String((error as { stdout?: unknown }).stdout ?? ''));
  }
}

async function listProcesses(): Promise<ProcessEnv[]> {
  if (process.platform === 'linux') return listProcessesSync();
  const { stdout } = await promisify(execFile)('ps', PS_ARGS, BUFFER).catch(
    () => ({ stdout: '' }),
  );
  return parsePs(stdout);
}

async function listCwds(): Promise<ProcessCwd[]> {
  if (process.platform === 'linux') return listCwdsSync();
  const { stdout } = await promisify(execFile)(
    'lsof',
    lsofArgs(),
    BUFFER,
  ).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? '' }));
  return parseLsof(stdout);
}
