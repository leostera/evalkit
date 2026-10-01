import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { starterFiles, starterReadme } from './new-project-template.js';

const gitDependency = 'git+https://github.com/leostera/evalkit.git';
const ignored = ['node_modules/', '_evalkit-results/', '_evalkit-sandbox/'];

const readIfExists = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

/** Create a standalone project, or initialize an existing project in place with `new .`. */
export async function newProject(
  args: string[],
  cwd = process.cwd(),
): Promise<string> {
  const { root, name, inPlace } = projectTarget(args, cwd);
  await prepareDirectory(root, inPlace);
  const packagePath = resolve(root, 'package.json');
  const pkg = await preparePackage(packagePath, name);
  await writeStarterFiles(root, inPlace);
  await updateGitignore(root);
  await writeStarterReadme(root, name, inPlace);
  // Persist metadata last; never replace an existing dependency or script.
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  return root;
}

function projectTarget(args: string[], cwd: string) {
  const inPlace = args.length === 1 && (args[0] === '.' || args[0] === './');
  const match =
    args.length === 1
      ? /^(?:\.\/)?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(args[0]!)
      : null;
  if (!inPlace && !match)
    throw new Error('Usage: evalkit new <lowercase-kebab-case-directory|.>');
  const root = inPlace ? resolve(cwd) : resolve(cwd, match![1]!);
  const name = inPlace
    ? basename(root)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'evalkit-evals'
    : match![1]!;
  return { root, name, inPlace };
}

async function prepareDirectory(root: string, inPlace: boolean): Promise<void> {
  if (inPlace) {
    if (!(await stat(root)).isDirectory())
      throw new Error(`Not a directory: ${root}`);
    await checkExistingScaffold(root);
  } else {
    // Atomic mkdir refuses to replace any existing project, even an empty one.
    try {
      await mkdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(`Directory already exists: ${root}`);
      throw error;
    }
  }
}

async function checkExistingScaffold(root: string): Promise<void> {
  // Validate everything before touching an existing project.
  for (const path of Object.keys(starterFiles).filter(
    (path) => path !== 'tsconfig.json',
  ))
    if (await exists(resolve(root, path)))
      throw new Error(`Scaffold file already exists: ${resolve(root, path)}`);
  for (const extension of ['js', 'mjs'])
    if (await exists(resolve(root, `evalkit.config.${extension}`)))
      throw new Error(
        `EvalKit config already exists: evalkit.config.${extension}`,
      );
  for (const directory of ['agents', 'fixtures', 'evals', 'judges']) {
    const path = resolve(root, directory);
    if ((await exists(path)) && !(await stat(path)).isDirectory())
      throw new Error(`Scaffold directory is not a directory: ${path}`);
  }
}

async function preparePackage(
  packagePath: string,
  name: string,
): Promise<Record<string, unknown>> {
  const originalPackage = await readIfExists(packagePath);
  const pkg = originalPackage
    ? (JSON.parse(originalPackage) as Record<string, unknown>)
    : ({ name, private: true, type: 'module' } as Record<string, unknown>);
  if (!pkg || Array.isArray(pkg) || typeof pkg !== 'object')
    throw new Error(`Invalid package.json: ${packagePath}`);
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const dependencies = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDependencies = (pkg.devDependencies ?? {}) as Record<string, string>;
  if (
    !scripts ||
    typeof scripts !== 'object' ||
    Array.isArray(scripts) ||
    !dependencies ||
    typeof dependencies !== 'object' ||
    Array.isArray(dependencies) ||
    !devDependencies ||
    typeof devDependencies !== 'object' ||
    Array.isArray(devDependencies)
  )
    throw new Error(
      `Invalid package.json scripts/dependencies: ${packagePath}`,
    );
  scripts.check ??= 'tsc --noEmit';
  scripts.evals ??= 'evalkit run-evals greeting --local';
  scripts.matrix ??= 'evalkit run-matrix styles --local';
  scripts['matrix:plan'] ??= 'evalkit run-matrix styles --dry-run';
  scripts.dashboard ??= 'evalkit serve-dashboard';
  if (
    !dependencies['@leostera/evalkit'] &&
    !devDependencies['@leostera/evalkit']
  )
    dependencies['@leostera/evalkit'] = gitDependency;
  if (!dependencies.typescript && !devDependencies.typescript)
    devDependencies.typescript = '^6.0.0';
  if (!dependencies['@types/bun'] && !devDependencies['@types/bun'])
    devDependencies['@types/bun'] = '^1.4.0';
  pkg.scripts = scripts;
  pkg.dependencies = dependencies;
  pkg.devDependencies = devDependencies;
  return pkg;
}

async function writeStarterFiles(
  root: string,
  inPlace: boolean,
): Promise<void> {
  for (const [path, contents] of Object.entries(starterFiles)) {
    const target = resolve(root, path);
    if (inPlace && path === 'tsconfig.json' && (await exists(target))) continue;
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, contents, { flag: 'wx' });
  }
}

async function updateGitignore(root: string): Promise<void> {
  const ignorePath = resolve(root, '.gitignore');
  const existingIgnore = (await readIfExists(ignorePath)) ?? '';
  const missing = ignored.filter(
    (entry) => !existingIgnore.split(/\r?\n/).includes(entry),
  );
  if (missing.length)
    await writeFile(
      ignorePath,
      `${existingIgnore}${existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`,
    );
}

async function writeStarterReadme(
  root: string,
  name: string,
  inPlace: boolean,
): Promise<void> {
  const readmePath = resolve(root, 'README.md');
  if (!inPlace && !(await exists(readmePath)))
    await writeFile(readmePath, starterReadme(name));
}
