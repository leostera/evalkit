import { defineEval, user } from '@evalkit/core';
import { localPiAgent } from '../agents/pi-agent.js';
import { piGreetingJudge } from '../judges/pi-judge.js';

export const piGreetingEval = defineEval({
  uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b02',
  name: 'Pi greeting',
  agent: localPiAgent,
  transcript: [user('Reply with a friendly greeting for Nami.')],
  scoring: [piGreetingJudge],
  policy: { trials: 10 },
});
