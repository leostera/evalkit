import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Create a standalone, provider-free project without contacting a registry. */
export async function newProject(
  args: string[],
  cwd = process.cwd(),
): Promise<string> {
  if (args.length !== 1 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(args[0]!))
    throw new Error('Usage: evalkit new <lowercase-kebab-case-directory>');
  const name = args[0]!;
  const root = resolve(cwd, name);
  // In the published package, dist/cli.mjs is adjacent to ../package.json.
  // The workspace CLI lives under packages/cli/src/ instead.
  const manifest = import.meta.url.includes('/src/')
    ? new URL('../../evalkit/package.json', import.meta.url)
    : new URL('../package.json', import.meta.url);
  const version = (
    JSON.parse(await readFile(manifest, 'utf8')) as { version: string }
  ).version;

  // mkdir is atomic: never replace an existing project, even an empty directory.
  try {
    await mkdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(`Directory already exists: ${root}`);
    throw error;
  }
  await mkdir(resolve(root, 'evals'));
  await Promise.all([
    writeFile(
      resolve(root, 'package.json'),
      JSON.stringify(
        {
          name,
          private: true,
          type: 'module',
          scripts: {
            evals: 'evalkit run-evals hello --local',
            dashboard: 'evalkit serve-dashboard',
          },
          dependencies: { '@leostera/evalkit': `^${version}` },
        },
        null,
        2,
      ) + '\n',
    ),
    writeFile(
      resolve(root, '.npmrc'),
      '@leostera:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n',
    ),
    writeFile(
      resolve(root, '.gitignore'),
      'node_modules/\n_evalkit-results/\n_evalkit-sandbox/\n',
    ),
    writeFile(
      resolve(root, 'evals/hello.eval.ts'),
      `import { defineAgent, defineEval, predicate, user } from '@leostera/evalkit';

const echo = defineAgent({
  identity: { kind: 'in-process', id: 'echo' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ onEvent }) {
    return {
      async send(message: string) {
        await onEvent({
          kind: 'message', role: 'assistant', content: \`Hello, \${message}\`,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {},
    };
  },
});

export default defineEval({
  id: 'hello',
  agent: echo,
  transcript: [user('Ada')],
  scoring: [predicate('greets Ada', ({ trajectory }) =>
    trajectory.events.some((event) => event.source === 'aut' &&
      event.kind === 'message' && event.role === 'assistant' &&
      event.content === 'Hello, Ada'))],
});
`,
    ),
    writeFile(
      resolve(root, 'README.md'),
      `# ${name}\n\nA local EvalKit project. Edit \`evals/hello.eval.ts\` to evaluate your own agent.\n\nSet \`GITHUB_PACKAGES_TOKEN\` to a GitHub token with \`read:packages\`, then run:\n\n\`\`\`sh\nbun install\nbun run evals\nbun run dashboard\n\`\`\`\n\nRun from this directory; reports and trial workspaces stay local and are ignored by Git.\n`,
    ),
  ]);
  return root;
}
