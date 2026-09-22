import { defineEval, user } from '@evalkit/core';
import { localPiAgent } from '../agents/pi-agent.js';
import {
  piNumberCloseToSevenJudge,
  piNumberCoolnessJudge,
} from '../judges/pi-number-judges.js';

export const piNumberEval = defineEval({
  uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b03',
  name: 'Pi random number',
  agent: localPiAgent,
  transcript: [
    user(
      'Choose a random integer from 0 to 10 using this per-trial random seed: {{randomSeed}}. Use the seed as entropy so different seeds produce different choices. Reply with only the number.',
    ),
  ],
  scoring: [piNumberCloseToSevenJudge, piNumberCoolnessJudge],
  policy: { trials: 10 },
});
