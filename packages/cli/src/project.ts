import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { importProjectModule } from './runtime.js';
import {
  defineEvalMatrix,
  defineSuite,
  recordError,
  registerEvals,
  authoringId,
  type EvalDefinition,
  type EvalRegistration,
  type RecordedError,
  type EvalkitConfig,
  type EvalRegistry,
} from '@evalkit/core';
import { globMatcher } from '@evalkit/core/glob';

const defaultInclude = ['**/*.eval.ts', '**/*.eval.js'];
const defaultExclude = ['**/node_modules/**', '**/.git/**', '**/_evalkit-*/**'];
async function exists(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
function evaluation(value: unknown, source: string): EvalDefinition {
  if (!value || typeof value !== 'object')
    throw new Error(
      `${source} must default-export defineEval(...) or an array of evals`,
    );
  const candidate = value as EvalDefinition;
  authoringId(candidate);
  if (
    typeof candidate.agent?.start !== 'function' ||
    !Array.isArray(candidate.transcript) ||
    !Array.isArray(candidate.scoring)
  )
    throw new Error(`Invalid eval exported by ${source}`);
  return candidate;
}
/** An eval file that threw while importing; it affects only the evals it defines. */
export type LoadError = {
  /** Path relative to the project root. */
  file: string;
  /** The suite its directory names, when directory suites are on. */
  suiteId?: string;
  error: RecordedError;
};

type Discovered = {
  registrations: EvalRegistration[];
  loadErrors: LoadError[];
};

/** The suite a discovered file belongs to: the first directory below the discovery root. */
function directorySuite(relativePath: string): string | undefined {
  const parts = relativePath.split('/');
  return parts.length > 1 ? parts[0] : undefined;
}

async function discover(
  root: string,
  config: EvalkitConfig,
): Promise<Discovered> {
  const testDir = config.testDir ?? 'scenarios';
  const directory = resolve(root, testDir);
  const includes = (config.include ?? defaultInclude).map((pattern) => ({
    match: globMatcher(pattern),
  }));
  const excludes = [...defaultExclude, ...(config.exclude ?? [])].map(
    (pattern) => ({ match: globMatcher(pattern) }),
  );
  const paths: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const file = resolve(dir, entry.name);
      const rel = relative(directory, file).split(sep).join('/');
      if (
        entry.isSymbolicLink() ||
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name.startsWith('_evalkit-')
      )
        continue;
      if (
        excludes.some(
          (glob) =>
            glob.match(rel) || (entry.isDirectory() && glob.match(`${rel}/`)),
        )
      )
        continue;
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && includes.some((glob) => glob.match(rel)))
        paths.push(file);
    }
  }
  try {
    await walk(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const hint =
      config.testDir === undefined &&
      (await isDirectory(resolve(root, 'evals')))
        ? ` Scenarios now live in scenarios/: move evals/ there, or set testDir: 'evals' in evalkit.config.ts.`
        : '';
    throw new Error(`Eval directory not found: ${directory}.${hint}`);
  }
  const directorySuites = config.discovery?.suites ?? true;
  const standalone: EvalDefinition[] = [];
  const bySuite = new Map<string, EvalDefinition[]>();
  const loadErrors: LoadError[] = [];
  for (const file of paths.sort()) {
    const fromRoot = relative(root, file).split(sep).join('/');
    const suiteId = directorySuites
      ? directorySuite(relative(directory, file).split(sep).join('/'))
      : undefined;
    try {
      if (suiteId !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suiteId))
        throw new Error(
          `Directory ${testDir}/${suiteId} names a suite, so it must be lowercase kebab-case (or set discovery.suites: false)`,
        );
      if (!(await readFile(file, 'utf8')).trim())
        throw new Error(
          `${fromRoot} is empty. Default-export a scenario: export default defineEval({ ... })`,
        );
      const module = (await importProjectModule(file)) as { default?: unknown };
      const exported = await module.default;
      const evals = (Array.isArray(exported) ? exported : [exported]).map(
        (value) => evaluation(value, fromRoot),
      );
      if (suiteId === undefined) standalone.push(...evals);
      else bySuite.set(suiteId, [...(bySuite.get(suiteId) ?? []), ...evals]);
    } catch (error) {
      loadErrors.push({
        file: fromRoot,
        ...(suiteId === undefined ? {} : { suiteId }),
        error: recordError(error),
      });
    }
  }
  if (!paths.length) throw new Error(`No eval files found in ${directory}`);
  return {
    registrations: [
      ...standalone,
      ...[...bySuite].map(([id, evals]) => defineSuite({ id, evals })),
    ],
    loadErrors,
  };
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  );
}

export type LoadedProject = {
  root: string;
  config: EvalkitConfig;
  registry: EvalRegistry;
  /** Discovered files that failed to import; empty with an explicit registry. */
  loadErrors: LoadError[];
};
/**
 * The project's config and root, without importing any scenario: enough for
 * commands that only touch results (`evalkit upgrade`), and that must work
 * while scenarios from an older EvalKit still fail to load.
 */
export async function loadConfig(
  cwd: string,
  configPath?: string,
): Promise<{ root: string; file?: string; config: EvalkitConfig }> {
  const candidates = configPath
    ? [resolve(cwd, configPath)]
    : ['evalkit.config.ts', 'evalkit.config.js', 'evalkit.config.mjs'].map(
        (name) => resolve(cwd, name),
      );
  const present: string[] = [];
  for (const file of candidates) if (await exists(file)) present.push(file);
  if (configPath && !present.length)
    throw new Error(`Config not found: ${configPath}`);
  if (present.length > 1)
    throw new Error('Multiple EvalKit configs found; select one with --config');
  const file = present[0];
  const root = file ? dirname(file) : resolve(cwd);
  const config: EvalkitConfig = file
    ? ((await importProjectModule(file)) as { default: EvalkitConfig }).default
    : {};
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error('Config must default-export defineConfig({...})');
  if (config.execution && 'trials' in config.execution)
    throw new Error(
      'execution.trials was renamed to execution.repeat in EvalKit 0.9',
    );
  if (config.judge !== undefined && typeof config.judge?.start !== 'function')
    throw new Error(
      'judge in the config must be an agent made with defineAgent()',
    );
  for (const [key, value] of Object.entries(config.execution ?? {})) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
      throw new Error(`execution.${key} must be a positive integer`);
  }
  return { root, ...(file ? { file } : {}), config };
}

export async function loadProject(
  cwd: string,
  configPath?: string,
): Promise<LoadedProject> {
  const { root, file, config } = await loadConfig(cwd, configPath);
  let registry = config.registry;
  if (
    !file &&
    !configPath &&
    (await exists(resolve(root, 'src/registry.ts')))
  ) {
    registry = (
      (await importProjectModule(resolve(root, 'src/registry.ts'))) as {
        default: EvalRegistry;
      }
    ).default;
  }
  let loadErrors: LoadError[] = [];
  if (!registry && config.evals) registry = registerEvals(config.evals);
  if (!registry) {
    const discovered = await discover(root, config);
    loadErrors = discovered.loadErrors;
    registry = registerEvals(discovered.registrations);
  }
  if (!registry?.evals || !registry.get)
    throw new Error('Invalid explicit eval registry');
  const ids = new Set<string>();
  for (const e of registry.evals) {
    const id = authoringId(e);
    if (ids.has(id)) throw new Error(`Duplicate eval ID: ${id}`);
    ids.add(id);
  }
  if (config.matrix) {
    const matrix = defineEvalMatrix({
      ...config.matrix,
      id: config.matrix.id ?? 'default',
      evals: registry.evals,
    });
    if (registry.matrices.some((m) => authoringId(m) === authoringId(matrix)))
      throw new Error(`Duplicate matrix ID: ${authoringId(matrix)}`);
    registry = { ...registry, matrices: [...registry.matrices, matrix] };
  }
  // The project's default judge shows in the catalog of every judge that names none.
  const judge = config.judge;
  if (judge) {
    const catalog = registry.catalog;
    registry = {
      ...registry,
      catalog: (options) => catalog({ judge, ...options }),
    };
  }
  return { root, config, registry, loadErrors };
}

/**
 * Where a project's run workspaces live. By default outside the project, in
 * the system temp directory (one directory per project, so `tidy` and `dev`
 * find the ones it kept): an agent that looks around its workspace finds no
 * project source, no `AGENTS.md` or skills above it, and no results.
 * `sandboxDir` overrides it; `inside` says when that puts them back in the
 * project, which `run` warns about.
 */
export function sandboxLocation(project: {
  root: string;
  config: { sandboxDir?: string };
}): { path: string; inside: boolean } {
  if (project.config.sandboxDir === undefined)
    return { path: defaultSandboxDir(project.root), inside: false };
  const path = resolve(project.root, project.config.sandboxDir);
  const fromRoot = relative(project.root, path);
  return {
    path,
    inside: !fromRoot.startsWith('..') && !isAbsolute(fromRoot),
  };
}

/** `<tmp>/evalkit/<project name>-<hash of its path>`: stable per checkout. */
export function defaultSandboxDir(root: string): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 10);
  const name = basename(root).replace(/[^A-Za-z0-9._-]/g, '-') || 'project';
  return join(tmpdir(), 'evalkit', `${name}-${hash}`);
}

/** The warning `run` prints when workspaces sit inside the project. */
export const SANDBOX_INSIDE_WARNING =
  'sandboxDir is inside the project: agents can read its source, its AGENTS.md and skills, its results and other runs’ workspaces from there. Leave sandboxDir unset to keep workspaces in the system temp directory.';
