import { defineEval, directory, user } from '@evalkit/core';

import { greetingAgent } from '../agents/greeting-agent.js';
import { greetingIsReturned } from '../judges/greeting.js';

export const greetingEval = defineEval({
  uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b01',
  name: 'Starter greeting',
  agent: greetingAgent,
  // Fixture paths are resolved from the project directory that invokes Evalkit.
  fixtures: [
    directory(
      'evalkit:fixture:0197f17c-4d89-7f81-9d42-6c497e6f6b13',
      'fixtures/starter',
    ),
  ],
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
  policy: { trials: 10 },
});
