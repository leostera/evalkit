// This is the runnable greeting eval from examples/starter.
// The documentation uses Markdown code blocks in src/content/docs/.
export const heroDefinition = `import { defineEval, directory, user } from '@evalkit/core';
import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export const greetingEval = defineEval({
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [directory('fixtures/starter')],
  transcript: [user('Say hello to Ada')],
  scoring: [greetingIsReturned],
  policy: { trials: 3 },
});

export default greetingEval;`;
