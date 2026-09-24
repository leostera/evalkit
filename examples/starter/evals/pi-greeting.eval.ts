import { defineEval, user } from '@evalkit/core';
import { localPiAgent } from '../agents/pi-agent.js';
import { piGreetingJudge } from '../judges/pi-judge.js';

export const piGreetingEval = defineEval({
  id: 'pi-greeting',
  name: 'Pi greeting',
  agent: localPiAgent,
  transcript: [user('Reply with a friendly greeting for Nami.')],
  scoring: [piGreetingJudge],
  policy: { trials: 10 },
});
