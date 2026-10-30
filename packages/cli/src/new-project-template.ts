/** Provider-free example: one dataset, agent, scorer, and a two-cell matrix. */
export const starterFiles: Record<string, string> = {
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
        'datasets/**/*.ts',
        'judges/**/*.ts',
        'scenarios/**/*.ts',
        'evalkit.config.ts',
      ],
    },
    null,
    2,
  )}\n`,
  'evalkit.config.ts': `import { defineConfig } from '@leostera/evalkit';

export default defineConfig({
  // Default-exported evals in scenarios/**/*.eval.ts are discovered automatically;
  // each directory below scenarios/ is a suite.
  matrix: {
    id: 'styles',
    parameters: { style: ['plain', 'shout'] },
  },
  execution: { concurrency: 2, maxCells: 20 },
});
`,
  'datasets/greeting/greeting.txt': 'Hello\n',
  'datasets/greeting.dataset.ts': `import { defineDataset } from '@leostera/evalkit';

// Files the agent can read: copied into each trial's workspace under greeting/.
// Paths are relative to the project root.
export const greeting = defineDataset({
  id: 'greeting',
  files: 'datasets/greeting',
});
`,
  'agents/greeting-agent.ts': `import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@leostera/evalkit';

// Replace this in-process example with an adapter for your own agent.
export const greetingAgent = defineAgent({
  identity: { id: 'greeting-agent', kind: 'in-process' },
  async start({ context }) {
    return {
      // Return the reply; EvalKit records it. Call onEvent instead to stream events.
      async send(message: string) {
        const file = join(context.workspace.root, 'greeting', 'greeting.txt');
        const prefix = (await readFile(file, 'utf8')).trim();
        const style = context.parameters?.style;
        if (style !== 'plain' && style !== 'shout')
          throw new Error(\`Unknown style: \${String(style)}\`);
        const greeting = \`\${prefix}, \${message}!\`;
        return style === 'shout' ? greeting.toUpperCase() : greeting;
      },
    };
  },
});
`,
  'judges/matches-greeting.ts': `import { predicate } from '@leostera/evalkit';

// Deterministic scorers need no judge model; add a separate judge agent for judge(...) rules.
export const matchesGreeting = predicate('matches greeting and style', ({ context, output }) => {
  const expected = context.parameters?.style === 'shout' ? 'HELLO, ADA!' : 'Hello, Ada!';
  return { value: output === expected ? 1 : 0, explanation: \`Expected \${expected}\` };
});
`,
  'scenarios/greeting.eval.ts': `import { defineEval, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greeting } from '../datasets/greeting.dataset.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  datasets: [greeting],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});
`,
};

export function starterReadme(name: string): string {
  return `# ${name}

A local EvalKit project. Each default-exported eval in \`scenarios/\` is discovered
automatically, and each directory below \`scenarios/\` is a suite. Start with
\`scenarios/greeting.eval.ts\`: it imports an in-process agent from \`agents/\`, a
dataset of files from \`datasets/\`, and a deterministic scorer from \`judges/\`.
Keep each scenario small and concrete; share agents, datasets and judges between them.

\`evalkit.config.ts\` defines a provider-free \`styles\` matrix; the example agent reads
\`context.parameters.style\`. Run:

\`\`\`sh
bun install
bun run check                                   # type-check your eval, agent, scorer, and config
bun run evalkit run                             # run the example across both styles
bun run evalkit run --matrix styles --dry-run   # inspect the matrix without running it
bun run evalkit dev                             # inspect local reports and launch runs
bun run evalkit build                           # write a read-only, shareable snapshot
\`\`\`

Coding agents can use the EvalKit skills that ship with the package, in
\`node_modules/@leostera/evalkit/dist/skills/\` (start with \`evalkit/SKILL.md\`).

EvalKit installs from npm. Reports, trial workspaces, and dashboard snapshots stay local
and are ignored by Git. A snapshot in \`_evalkit-dashboard/\` contains report messages,
scores, evidence, and candidate files (never evaluator workspaces): review it before sharing.
`;
}
