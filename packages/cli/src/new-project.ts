import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const gitDependency = 'git+https://github.com/leostera/evalkit.git';
const ignored = ['node_modules/', '_evalkit-results/', '_evalkit-sandbox/'];

/** The starter's matrix, fixture, agent and scorer all run without credentials. */
const template: Record<string, string> = {
  'tsconfig.json': `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
        types: ['bun'],
      },
      include: [
        'agents/**/*.ts',
        'evals/**/*.ts',
        'judges/**/*.ts',
        'evalkit.config.ts',
      ],
    },
    null,
    2,
  )}\n`,
  'evalkit.config.ts': `import { defineConfig } from '@leostera/evalkit';

export default defineConfig({
  // Default-exported evals in evals/*.eval.ts are discovered automatically.
  matrix: {
    id: 'styles',
    parameters: { style: ['plain', 'shout'] },
  },
  execution: { concurrency: 2, maxCells: 20 },
});
`,
  'fixtures/greeting.txt': 'Hello\n',
  'agents/greeting-agent.ts': `import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@leostera/evalkit';

// Replace this in-process example with an adapter for your own agent.
export const greetingAgent = defineAgent({
  identity: { id: 'greeting-agent', kind: 'in-process' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context, onEvent }) {
    return {
      async send(message: string) {
        // Fixtures copied to the candidate workspace are visible to the AUT.
        const prefix = (await readFile(join(context.workspace.root, 'greeting.txt'), 'utf8')).trim();
        const style = context.parameters?.style;
        if (style !== 'plain' && style !== 'shout')
          throw new Error(\`Unknown style: \${String(style)}\`);
        const greeting = \`\${prefix}, \${message}!\`;
        await onEvent({
          kind: 'message', role: 'assistant',
          content: style === 'shout' ? greeting.toUpperCase() : greeting,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {},
    };
  },
});
`,
  'judges/matches-greeting.ts': `import { predicate } from '@leostera/evalkit';

// Deterministic scorers need no judge model; add a separate judge agent for judge(...) rules.
export const matchesGreeting = predicate('matches greeting and style', ({ context, trajectory }) => {
  const reply = trajectory.events.filter(
    (event) => event.source === 'aut' && event.kind === 'message' && event.role === 'assistant',
  ).at(-1);
  const expected = context.parameters?.style === 'shout' ? 'HELLO, ADA!' : 'Hello, Ada!';
  return {
    value: reply?.kind === 'message' && reply.content === expected ? 1 : 0,
    explanation: \`Expected \${expected}\`,
  };
});
`,
  'evals/greeting.eval.ts': `import { defineEval, file, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [file('fixtures/greeting.txt', { dst: 'greeting.txt', visibility: 'candidate' })],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});
`,
};

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
  const packagePath = resolve(root, 'package.json');
  if (inPlace) {
    if (!(await stat(root)).isDirectory())
      throw new Error(`Not a directory: ${root}`);
    // Check every generated path before any writes to an existing project.
    for (const path of Object.keys(template).filter(
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

  for (const [path, contents] of Object.entries(template)) {
    const target = resolve(root, path);
    if (inPlace && path === 'tsconfig.json' && (await exists(target))) continue;
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, contents, { flag: 'wx' });
  }

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

  const readmePath = resolve(root, 'README.md');
  if (!inPlace && !(await exists(readmePath)))
    await writeFile(
      readmePath,
      `# ${name}\n\nA local EvalKit project. Each default-exported eval in \`evals/\` is discovered automatically. Start with \`evals/greeting.eval.ts\`: it imports an in-process agent from \`agents/\`, a deterministic scorer from \`judges/\`, and a candidate-visible file from \`fixtures/\`. Replace these examples with your own agent, tasks, and checks.\n\n\`evalkit.config.ts\` defines a provider-free \`styles\` matrix; the example agent reads \`context.parameters.style\`. Run:\n\n\`\`\`sh\nbun install\nbun run check        # type-check your eval, agent, scorer, and config\nbun run evals        # run the example across both styles\nbun run matrix:plan  # inspect the matrix without running it\nbun run matrix       # run the configured matrix\nbun run dashboard    # inspect local reports\n\`\`\`\n\nEvalKit installs from the public GitHub repository; no registry token is needed. Reports and trial workspaces stay local and are ignored by Git. Commit \`bun.lock\` to pin the resolved EvalKit Git revision.\n`,
    );

  // Persist metadata last; never replace an existing dependency or script.
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  return root;
}
