/** Provider-free example: one fixture, agent, scorer, and a two-cell matrix. */
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

export function starterReadme(name: string): string {
  return `# ${name}

A local EvalKit project. Each default-exported eval in \`evals/\` is discovered automatically.
Start with \`evals/greeting.eval.ts\`: it imports an in-process agent from \`agents/\`,
a deterministic scorer from \`judges/\`, and a candidate-visible file from \`fixtures/\`.
Replace these examples with your own agent, tasks, and checks.

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

EvalKit installs from npm. Reports, trial workspaces, and dashboard snapshots stay local
and are ignored by Git. A snapshot in \`_evalkit-dashboard/\` contains report messages,
scores, evidence, and candidate files (never evaluator workspaces): review it before sharing.
`;
}
