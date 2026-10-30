/**
 * Where an agent, dataset, judge or scenario was defined: the file and line of
 * the call to its `define…` helper, read from the call stack the way test
 * runners locate tests. Best effort: absent when the stack has no file frame
 * (some bundlers, Workers). Kept off the object's own enumerable keys so it
 * never changes equality, JSON or spreading.
 */
export type DefinitionSite = { file: string; line: number };

const SITE = Symbol.for('evalkit.definitionSite');
const internalFiles = new Set<string>();

/** Call from each module that defines helpers, so its frames are skipped. */
export function internalModule(url: string | undefined): void {
  // Some bundles (Workers) have no module URL; their stacks have no files either.
  if (url) internalFiles.add(filePath(url));
}

internalModule(import.meta.url);

export function markDefinitionSite<T extends object>(value: T): T {
  if (Object.hasOwn(value, SITE)) return value;
  const site = callerSite();
  if (site)
    Object.defineProperty(value, SITE, { value: site, enumerable: false });
  return value;
}

export function definitionSite(value: unknown): DefinitionSite | undefined {
  return typeof value === 'object' && value !== null
    ? ((value as Record<symbol, DefinitionSite | undefined>)[SITE] ?? undefined)
    : undefined;
}

/** `file:line` relative to `root`, or undefined outside it (never an absolute path). */
export function relativeSite(
  site: DefinitionSite | undefined,
  root: string | undefined,
): string | undefined {
  if (!site || !root) return undefined;
  const base = root.replace(/[\\/]+$/, '') + '/';
  const file = site.file.replace(/\\/g, '/');
  const prefix = base.replace(/\\/g, '/');
  if (!file.startsWith(prefix)) return undefined;
  return `${file.slice(prefix.length)}:${site.line}`;
}

const FRAME =
  /\(?((?:file:\/\/)?(?:\/|[A-Za-z]:[\\/])[^():]*):(\d+):\d+\)?\s*$/;

function callerSite(): DefinitionSite | undefined {
  const stack = new Error().stack?.split('\n').slice(1) ?? [];
  for (const frame of stack) {
    const match = FRAME.exec(frame);
    if (!match) continue;
    const file = filePath(match[1]!);
    if (internalFiles.has(file) || file.includes('/node_modules/')) continue;
    return { file, line: Number(match[2]) };
  }
  return undefined;
}

function filePath(location: string): string {
  if (!location.startsWith('file://')) return location;
  try {
    return decodeURIComponent(new URL(location).pathname);
  } catch {
    return location.slice('file://'.length);
  }
}
