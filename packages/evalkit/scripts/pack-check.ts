import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const repositoryRoot = packageRoot;
const temporaryRoot = await mkdtemp(join(tmpdir(), 'evalkit-package-'));

function run(args: string[], cwd: string): string {
  const process = Bun.spawnSync(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const output = `${new TextDecoder().decode(process.stdout)}\n${new TextDecoder().decode(process.stderr)}`;
  if (process.exitCode !== 0)
    throw new Error(`${args.join(' ')} failed:\n${output}`);
  return output;
}

try {
  const pack = JSON.parse(
    run(
      [
        'npm',
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporaryRoot,
      ],
      packageRoot,
    ),
  ) as { filename: string; files: { path: string }[] }[];
  const paths = pack[0]!.files.map(({ path }) => path);
  for (const path of [
    'dist/cli.mjs',
    'dist/index.mjs',
    'dist/index.d.mts',
    'dist/dashboard/index.html',
  ]) {
    if (!paths.includes(path))
      throw new Error(`Missing ${path} from package tarball`);
  }
  for (const path of paths.filter((entry) => /\.mjs$|\.d\.mts$/.test(entry))) {
    const contents = await readFile(join(packageRoot, path), 'utf8');
    if (/\bfrom ["']@evalkit\//.test(contents))
      throw new Error(`Workspace dependency leaked into ${path}`);
  }

  const projectRoot = join(temporaryRoot, 'consumer');
  await mkdir(join(projectRoot, 'evals'), { recursive: true });
  await writeFile(
    join(projectRoot, 'package.json'),
    JSON.stringify({
      name: 'evalkit-external-smoke',
      private: true,
      type: 'module',
      dependencies: {
        '@leostera/evalkit': `file:${join(temporaryRoot, pack[0]!.filename)}`,
      },
    }),
  );
  await writeFile(
    join(projectRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
      },
    }),
  );
  await writeFile(
    join(projectRoot, 'evals/hello.eval.ts'),
    `
import { defineAgent, defineEval, predicate, user } from '@leostera/evalkit';
import { localReportStore } from '@leostera/evalkit/runner';
void localReportStore;
export default defineEval({
  id: 'hello',
  agent: defineAgent({
    identity: { id: 'hello-agent', kind: 'local' },
    runtimes: { local: { kind: 'in-process' } },
    async start({ onEvent }) {
      return {
        async send(message: string) {
          await onEvent({ kind: 'message', role: 'assistant', content: message, timestamp: new Date().toISOString() });
        },
        async close() {},
      };
    },
  }),
  transcript: [user('hello')],
  scoring: [predicate('echoes', ({ trajectory }) => Number(trajectory.events.some(
    (event) => event.kind === 'message' && event.role === 'assistant' && event.content === 'hello',
  )))],
});
`,
  );
  run(['bun', 'install'], projectRoot);
  run(
    [join(repositoryRoot, 'node_modules/.bin/tsc'), '--project', projectRoot],
    projectRoot,
  );
  const output = run(
    ['bun', 'run', 'evalkit', 'run-evals', 'hello', '--trials', '1', '--local'],
    projectRoot,
  );
  if (!output.includes('PASS hello'))
    throw new Error(`The installed CLI did not pass:\n${output}`);
  const runs = await readdir(join(projectRoot, '_evalkit-results'));
  if (runs.length !== 1)
    throw new Error(`Expected one run, found ${runs.length}`);
  const summary = JSON.parse(
    await readFile(
      join(projectRoot, '_evalkit-results', runs[0]!, 'summary.json'),
      'utf8',
    ),
  ) as { failed: number };
  if (summary.failed !== 0) throw new Error('The external eval failed');

  run(['bun', 'run', 'evalkit', 'new', 'my-evals'], projectRoot);
  const scaffold = join(projectRoot, 'my-evals');
  const generated = JSON.parse(
    await readFile(join(scaffold, 'package.json'), 'utf8'),
  ) as {
    dependencies: Record<string, string>;
  };
  // Exercise the generated project using this local tarball before publication.
  generated.dependencies['@leostera/evalkit'] =
    `file:${join(temporaryRoot, pack[0]!.filename)}`;
  await writeFile(join(scaffold, 'package.json'), JSON.stringify(generated));
  run(['bun', 'install'], scaffold);
  run(['bun', 'run', 'check'], scaffold);
  const scaffoldOutput = run(['bun', 'run', 'evals'], scaffold);
  if ((scaffoldOutput.match(/PASS greeting/g) ?? []).length !== 2)
    throw new Error(`Generated eval did not pass:\n${scaffoldOutput}`);
  const matrixPlan = run(['bun', 'run', 'matrix:plan'], scaffold);
  if (!/"cells"\s*:\s*2\b/.test(matrixPlan))
    throw new Error(
      `Expected two matrix cells in the dry-run plan:\n${matrixPlan}`,
    );
  // Simulate `bun add <Git URL>; bun run evalkit new .` in an existing project.
  const existing = join(temporaryRoot, 'existing');
  await mkdir(existing);
  const dependency = `file:${join(temporaryRoot, pack[0]!.filename)}`;
  await writeFile(
    join(existing, 'package.json'),
    JSON.stringify({
      name: 'existing',
      private: true,
      scripts: { test: 'echo preserved' },
      dependencies: { '@leostera/evalkit': dependency },
    }),
  );
  await writeFile(join(existing, 'README.md'), 'Preserve this file.\n');
  run(['bun', 'install'], existing);
  run(['bun', 'run', 'evalkit', 'new', '.'], existing);
  run(['bun', 'install'], existing);
  run(['bun', 'run', 'check'], existing);
  const existingPackage = JSON.parse(
    await readFile(join(existing, 'package.json'), 'utf8'),
  ) as {
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  if (
    existingPackage.dependencies['@leostera/evalkit'] !== dependency ||
    existingPackage.scripts.test !== 'echo preserved'
  )
    throw new Error('In-place setup changed existing package metadata');
  if (
    (await readFile(join(existing, 'README.md'), 'utf8')) !==
    'Preserve this file.\n'
  )
    throw new Error('In-place setup overwrote the existing README');
  if (
    (run(['bun', 'run', 'evals'], existing).match(/PASS greeting/g) ?? [])
      .length !== 2
  )
    throw new Error('In-place generated eval did not pass');
  console.log(
    'Packed package: isolated import, CLI run, new directory, in-place setup, and evals passed.',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
