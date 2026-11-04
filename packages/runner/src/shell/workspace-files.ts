import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Shell } from '@evalkit/core';

/**
 * A path relative to the workspace, as an absolute host path; one that
 * would leave the workspace is an error.
 */
export function insideWorkspace(root: string, relative = '.'): string {
  if (path.isAbsolute(relative))
    throw new Error(
      `Shell paths are relative to the workspace; received ${relative}`,
    );
  return inside(root, relative, relative);
}

function inside(root: string, file: string, shown: string): string {
  const resolved = path.resolve(root, file);
  const back = path.relative(root, resolved);
  if (back.startsWith('..') || path.isAbsolute(back))
    throw new Error(`${shown} is outside the run's workspace and home`);
  return resolved;
}

/** Where the shell's directories are on the host, and where commands see them. */
export type ShellDirectories = {
  /** The workspace on the host. */
  root: string;
  /** The workspace as commands see it. */
  seenRoot: string;
  /** The run's private home on the host. */
  home: string;
  /** The home as commands see it. */
  seenHome: string;
};

/**
 * A shell path as a host path: relative ones are in the workspace,
 * absolute ones must be inside the workspace or the home as commands see
 * them.
 */
export function hostPath(directories: ShellDirectories, file = '.'): string {
  if (!path.isAbsolute(file)) return inside(directories.root, file, file);
  for (const [seen, host] of [
    [directories.seenHome, directories.home],
    [directories.seenRoot, directories.root],
  ] as const) {
    const back = path.relative(seen, file);
    if (!back.startsWith('..') && !path.isAbsolute(back))
      return inside(host, back, file);
  }
  throw new Error(`${file} is outside the run's workspace and home`);
}

/**
 * The shell's file operations, on the host's copies of the workspace and
 * home: for container isolation they are bind-mounted, so the container
 * sees the same files.
 */
export function shellFiles(
  directories: ShellDirectories,
): Pick<Shell, 'home' | 'readFile' | 'writeFile' | 'list'> {
  const resolve = (file?: string) => hostPath(directories, file);
  return {
    home: directories.seenHome,
    readFile: async (file) => readFile(resolve(file), 'utf8'),
    async writeFile(file, content) {
      const target = resolve(file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    },
    async list(directory = '.') {
      const entries = await readdir(resolve(directory), {
        withFileTypes: true,
      });
      return entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort();
    },
  };
}
