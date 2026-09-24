import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'evalkit-package-'));

function run(args: string[], cwd: string): string {
  const process = Bun.spawnSync(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const output = `${new TextDecoder().decode(process.stdout)}\n${new TextDecoder().decode(process.stderr)}`;
  if (process.exitCode !== 0) throw new Error(`${args.join(' ')} failed:\n${output}`);
  return output;
}

try {
  const pack = JSON.parse(run(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', temporaryRoot], packageRoot)) as { filename: string; files: { path: string }[] }[];
  const paths = pack[0]!.files.map(({ path }) => path);
  for (const path of ['dist/cli.mjs', 'dist/index.mjs', 'dist/index.d.mts', 'dist/dashboard/index.html']) {
    if (!paths.includes(path)) throw new Error(`Missing ${path} from package tarball`);
  }
  for (const path of paths.filter((entry) => /\.mjs$|\.d\.mts$/.test(entry))) {
    const contents = await readFile(join(packageRoot, path), 'utf8');
    if (/\bfrom ["']@evalkit\//.test(contents))
      throw new Error(`Workspace dependency leaked into ${path}`);
  }

  const projectRoot = join(temporaryRoot, 'consumer');
  await mkdir(join(projectRoot, 'evals'), { recursive: true });
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({
    name: 'evalkit-external-smoke', private: true, type: 'module',
    dependencies: { '@leostera/evalkit': `file:${join(temporaryRoot, pack[0]!.filename)}` },
  }));
  await writeFile(join(projectRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true,
  } }));
  await writeFile(join(projectRoot, 'evals/hello.eval.ts'), `
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
`);
  run(['bun', 'install'], projectRoot);
  run([join(repositoryRoot, 'node_modules/.bin/tsc'), '--project', projectRoot], projectRoot);
  const output = run(['bun', 'run', 'evalkit', 'run-evals', 'hello', '--trials', '1', '--local'], projectRoot);
  if (!output.includes('PASS hello')) throw new Error(`The installed CLI did not pass:\n${output}`);
  const runs = await readdir(join(projectRoot, '_evalkit-results'));
  if (runs.length !== 1) throw new Error(`Expected one run, found ${runs.length}`);
  const summary = JSON.parse(await readFile(join(projectRoot, '_evalkit-results', runs[0]!, 'summary.json'), 'utf8')) as { failed: number };
  if (summary.failed !== 0) throw new Error('The external eval failed');
  console.log('Packed package: isolated TypeScript import, CLI run, and report passed.');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
