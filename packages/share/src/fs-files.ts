import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { ShareFiles } from './files.js';

/** Result files in a directory, for `evalkit share serve` and tests. */
export function directoryFiles(root: string): ShareFiles {
  const base = resolve(root);
  const pathFor = (key: string) => {
    const path = resolve(base, key);
    if (!path.startsWith(`${base}${sep}`))
      throw new Error(`Invalid storage key: ${key}`);
    return path;
  };
  return {
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async put(key, data) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      // Write then rename so readers never see a partial file.
      const temporary = `${path}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, data);
      await rename(temporary, path);
    },
    async *list(prefix) {
      const trimmed = prefix.replace(/\/+$/, '');
      const start = trimmed ? pathFor(trimmed) : base;
      let entries;
      try {
        entries = await readdir(start, {
          withFileTypes: true,
          recursive: true,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries)
        if (entry.isFile() && !entry.name.endsWith('.tmp'))
          yield relative(base, join(entry.parentPath, entry.name))
            .split(sep)
            .join('/');
    },
  };
}
