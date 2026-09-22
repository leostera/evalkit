import { defineEval, directory, user } from '@evalkit/core';

import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export const greetingEval = defineEval({
  id: 'starter-greeting',
  name: 'Starter greeting',
  agent: greetingAgent,
  // Fixture paths are resolved from the project directory that invokes Evalkit.
  fixtures: [directory('fixtures/starter')],
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
  policy: { trials: 10 },
});
