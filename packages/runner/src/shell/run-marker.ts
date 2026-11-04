import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readdir, readFile, readlink, realpath } from 'node:fs/promises';
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

/**
 * Kills every process of this user still carrying the run's marker, or
 * working inside one of the run's directories. The second catches what
 * the first cannot see: macOS hides the environment of its own binaries.
 */
export async function killRunProcesses(
  marker: string,
  directories: readonly string[],
): Promise<number[]> {
  const [marked, inside] = await Promise.all([
    markedProcesses(marker),
    processesInside(directories),
  ]);
  const pids = [...new Set([...marked, ...inside])].filter(
    (pid) => pid !== process.pid,
  );
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // It is gone.
    }
  }
  return pids;
}

async function processesInside(
  directories: readonly string[],
): Promise<number[]> {
  const roots = await Promise.all(
    directories.map((directory) => realpath(directory).catch(() => directory)),
  );
  const isInside = (cwd: string) =>
    roots.some((root) => cwd === root || cwd.startsWith(`${root}${path.sep}`));
  const pids: number[] = [];
  if (process.platform === 'linux') {
    for (const entry of await readdir('/proc').catch(() => [])) {
      if (!/^\d+$/.test(entry)) continue;
      const cwd = await readlink(`/proc/${entry}/cwd`).catch(() => '');
      if (cwd && isInside(cwd)) pids.push(Number(entry));
    }
    return pids;
  }
  // `lsof -Fpn` prints `p<pid>` then `n<cwd>` for each process.
  const { stdout } = await promisify(execFile)(
    'lsof',
    ['-a', '-d', 'cwd', '-u', String(process.getuid?.() ?? ''), '-Fpn'],
    { maxBuffer: 64 * 1024 * 1024 },
  ).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? '' }));
  let pid: number | undefined;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number.parseInt(line.slice(1), 10);
    else if (
      line.startsWith('n') &&
      pid !== undefined &&
      isInside(line.slice(1))
    )
      pids.push(pid);
  }
  return pids;
}

const needle = (marker: string) => `${RUN_MARKER}=${marker}`;

async function markedProcesses(marker: string): Promise<number[]> {
  if (process.platform === 'linux') {
    const pids: number[] = [];
    for (const entry of await readdir('/proc').catch(() => [])) {
      if (!/^\d+$/.test(entry)) continue;
      const environ = await readFile(`/proc/${entry}/environ`, 'utf8').catch(
        () => '',
      );
      if (environ.split('\0').includes(needle(marker)))
        pids.push(Number(entry));
    }
    return pids;
  }
  // `ps -E` appends each process's environment, for this user's processes.
  const { stdout } = await promisify(execFile)(
    'ps',
    ['-E', '-ww', '-A', '-o', 'pid=,command='],
    { maxBuffer: 64 * 1024 * 1024 },
  ).catch(() => ({ stdout: '' }));
  const pattern = new RegExp(`(?:^|\\s)${needle(marker)}(?:\\s|$)`);
  return stdout
    .split('\n')
    .filter((line) => pattern.test(line))
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter(Number.isInteger);
}
