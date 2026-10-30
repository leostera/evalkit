import { defineEval, user } from '@evalkit/core';

import { greetingAgent } from '../agents/greeting-agent.js';
import { starter } from '../datasets/starter.dataset.js';
import { greetingIsReturned } from '../judges/greeting.js';

export const greetingEval = defineEval({
  id: 'greeting',
  name: 'Starter greeting',
  agent: greetingAgent,
  datasets: [starter],
  transcript: [user('Ada')],
  scoring: [greetingIsReturned],
  policy: { trials: 10 },
});

export default greetingEval;
