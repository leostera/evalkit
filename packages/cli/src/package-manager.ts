import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The package managers whose `<pm> run <script>` EvalKit suggests. */
export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

const LOCKFILES: ReadonlyArray<[string, PackageManager]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
];

/**
 * The package manager a project uses: the one that started this process
 * (`npm_config_user_agent`), else the nearest lockfile at or above `root`
 * (a workspace keeps it at its root), else bun. Suggesting another manager's
 * command can make someone run its install and rewrite `node_modules`.
 */
export function detectPackageManager(
  root: string,
  userAgent = process.env.npm_config_user_agent,
): PackageManager {
  const started = userAgent?.split('/')[0];
  if (
    started === 'bun' ||
    started === 'pnpm' ||
    started === 'yarn' ||
    started === 'npm'
  )
    return started;
  for (let dir = root; ; dir = dirname(dir)) {
    for (const [file, manager] of LOCKFILES)
      if (existsSync(join(dir, file))) return manager;
    if (dirname(dir) === dir) return 'bun';
  }
}

/** `pnpm run evalkit dev` (or `npm run evalkit -- dev`: npm needs the `--` for flags). */
export function evalkitCommand(manager: PackageManager, args: string): string {
  return manager === 'npm'
    ? `npm run evalkit -- ${args}`
    : `${manager} run evalkit ${args}`;
}
