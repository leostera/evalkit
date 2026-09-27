import { defineEval, user } from '@evalkit/core';
import { localPiAgent } from '../agents/pi-agent.js';
import {
  piNumberCloseToSevenJudge,
  piNumberCoolnessJudge,
} from '../judges/pi-number-judges.js';

export const piNumberEval = defineEval({
  id: 'pi-number',
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

export default piNumberEval;
