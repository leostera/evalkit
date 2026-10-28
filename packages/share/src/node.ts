import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createShareApp, type DashboardAssets } from './app.js';
import { directoryFiles } from './fs-files.js';
import { sqliteIndex } from './index-bun.js';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Serve the bundled dashboard from a directory (`dist/dashboard`). */
export function directoryAssets(root: string): DashboardAssets {
  const base = resolve(root);
  return {
    index: () => readFile(join(base, 'index.html'), 'utf8'),
    async get(path) {
      const file = resolve(base, 'assets', path);
      if (!file.startsWith(`${base}${sep}`)) return null;
      try {
        const extension = file.slice(file.lastIndexOf('.'));
        return new Response(await readFile(file), {
          headers: {
            'content-type': TYPES[extension] ?? 'application/octet-stream',
          },
        });
      } catch {
        return null;
      }
    },
  };
}

/** A share server on Bun: files and `index.sqlite` live in `dir`. */
export async function createDirectoryShareApp(options: {
  dir: string;
  dashboardRoot: string;
}) {
  await mkdir(options.dir, { recursive: true });
  return createShareApp({
    files: directoryFiles(join(options.dir, 'files')),
    index: sqliteIndex(join(options.dir, 'index.sqlite')),
    assets: directoryAssets(options.dashboardRoot),
  });
}
