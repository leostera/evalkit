import { defineSuite, registerEvals } from '@evalkit/core';

import { greetingEval } from '../evals/greeting.eval.js';
import { piGreetingEval } from '../evals/pi-greeting.eval.js';
import { piNumberEval } from '../evals/pi-number.eval.js';

export default registerEvals([
  defineSuite({
    id: 'starter',
    name: 'Starter Example',
    evals: [greetingEval, piGreetingEval, piNumberEval],
  }),
]);
