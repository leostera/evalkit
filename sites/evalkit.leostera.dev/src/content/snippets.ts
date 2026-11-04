// A small local Shiki theme avoids runtime or external theme dependencies.
export const codeTheme = {
  name: 'evalkit-light',
  type: 'light' as const,
  colors: { 'editor.background': '#ffffff', 'editor.foreground': '#18212f' },
  tokenColors: [
    { scope: ['keyword', 'storage'], settings: { foreground: '#2455d6' } },
    { scope: ['string'], settings: { foreground: '#176043' } },
    { scope: ['entity.name.function'], settings: { foreground: '#7545a0' } },
    { scope: ['comment'], settings: { foreground: '#536071' } },
  ],
};

// Public-package example: kept in sync with packages/cli/src/new-project-template.ts.
export const heroDefinition = `import { defineEval, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greeting } from '../datasets/greeting.dataset.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  datasets: [greeting],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});`;

export const scaffoldCommand = 'bunx @leostera/evalkit new ./agent-evals';

export const setupCommands = `${scaffoldCommand}
cd agent-evals
bun install
bun run check
bun run evalkit run
bun run evalkit dev`;

// A coding agent as the agent under test, scored by running the project's tests.
export const harnessExample = `import { defineEval, piAgent, predicate, user }
  from '@leostera/evalkit';
import { repo } from '../datasets/repo.dataset.js';

const testsPass = predicate('tests pass', async ({ context }) => {
  const { exitCode } = await context.shell.exec('bun test');
  return exitCode === 0;
});

export default defineEval({
  id: 'fix-failing-test',
  // The model comes from the matrix cell: one session per run.
  agent: piAgent({ model: ({ model }) => String(model) }),
  datasets: [repo],
  transcript: [user('src/sum.test.ts fails. Fix the code.')],
  scoring: [testsPass],
});`;

// Where runs happen, and what they may use.
export const sandboxExample = `import { defineConfig, defineSandbox }
  from '@leostera/evalkit';

const node = defineSandbox({
  id: 'node',
  kind: 'container',
  dockerfile: './evals/Dockerfile',
  containerOpts: { network: 'fixtures' },
});

export default defineConfig({
  sandboxes: { node },
  sandbox: 'node',
  limits: { steps: 80, time: '20m' },
  fixtures: {
    api: {
      start: 'bun run fixtures/api.ts',
      ready: 'http://localhost:8787/health',
    },
  },
});`;

export const ciCommands = `bun run evalkit run --junit _evalkit-results/junit.xml
bun run evalkit share
bun run evalkit compare --base main --fail-on regression --markdown compare.md`;
