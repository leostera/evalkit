// Short, illustrative examples for the getting started page. The complete,
// authoritative examples live in the manual and examples/starter.
export const firstRun = `bun create github.com/leostera/evalkit
cd evalkit/examples/starter
bun run evalkit run-evals greeting
bun run evalkit serve-dashboard`;

export const evalDefinition = `import { defineEval, user } from '@evalkit/core';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export const greetingEval = defineEval({
  id: 'greeting',
  name: 'Starter greeting',
  agent: greetingAgent,
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
  policy: { trials: 3 },
});`;

export const agentDefinition = `import { defineAgent } from '@evalkit/core';

export const greetingAgent = defineAgent({
  identity: {
    kind: 'example',
    id: 'greeting-agent',
  },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context, onEvent }) {
    return {
      async send(message: string) {
        await onEvent({
          kind: 'message', role: 'assistant',
          content: \`Hello, \${message}\`,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {},
    };
  },
});`;

export const fixtureDefinition = `import { directory, file, inlineFile } from '@evalkit/core';

const fixtures = [
  directory('fixtures/starter'),
  file('fixtures/answer.txt', {
    dst: 'answer.txt', visibility: 'evaluator',
  }),
  inlineFile('prompt.txt',
    'Say hello.', 'candidate'),
];`;

export const scorerDefinition = `import { predicate } from '@evalkit/core';

export const greetingIsReturned = predicate(
  'returns a greeting',
  ({ trajectory }) => {
    const reply = trajectory.events.find(event =>
      event.source === 'aut' &&
      event.kind === 'message' &&
      event.role === 'assistant'
    );
    const passed = reply?.kind === 'message' &&
      reply.content === 'Hello, Ada';
    return { value: passed ? 1 : 0, passed,
      explanation: 'Expected the greeting for Ada.' };
  },
);`;

export const projectConfig = `// evalkit.config.js
import { defineConfig } from '@evalkit/core';

export default defineConfig({
  testDir: 'evals',
  matrix: {
    id: 'models',
    parameters: { model: ['model-a', 'model-b'] },
    defaults: { turnBudget: 6 },
  },
  execution: { concurrency: 4, maxCells: 100 },
});`;

export const matrixCommands = `bun run evalkit run-matrix models --eval greeting --dry-run
bun run evalkit run-matrix models --eval greeting --model model-a
bun run evalkit run-matrix models --eval greeting --model model-b`;

export const resultsCommand = `RUN="_evalkit-results/<run-id>"
jq '{trialCount, passed, failed}' "$RUN/summary.json"
jq -r '.results[] | [.name, .value, .passed] | @tsv' "$RUN"/trials/*/scoring.json`;

export const heroDefinition = `export const greetingEval = defineEval({
  // Stable identity for this evaluation
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [starterFiles],
  transcript: [user('Say hello to Ada')],
  scoring: [greetingIsReturned],
  policy: { trials: 3 },
});`;
