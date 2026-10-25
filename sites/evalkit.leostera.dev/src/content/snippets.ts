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
export const heroDefinition = `import { defineEval, file, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [
    file('fixtures/greeting.txt', {
      dst: 'greeting.txt',
      visibility: 'candidate',
    }),
  ],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});`;

export const scaffoldCommand = 'bunx @leostera/evalkit new ./evals';

export const setupCommands = `${scaffoldCommand}
cd evals
bun install
bun run check
bun run evals
bun run dashboard`;
