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
  const resolved = path.resolve(root, relative);
  const back = path.relative(root, resolved);
  if (back.startsWith('..') || path.isAbsolute(back))
    throw new Error(`${relative} is outside the run's workspace`);
  return resolved;
}

/**
 * The shell's file operations, on the host's copy of the workspace: for
 * container isolation it is bind-mounted, so the container sees the same
 * files.
 */
export function workspaceFiles(
  root: string,
): Pick<Shell, 'readFile' | 'writeFile' | 'list'> {
  return {
    readFile: async (file) => readFile(insideWorkspace(root, file), 'utf8'),
    async writeFile(file, content) {
      const target = insideWorkspace(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    },
    async list(directory = '.') {
      const entries = await readdir(insideWorkspace(root, directory), {
        withFileTypes: true,
      });
      return entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort();
    },
  };
}
