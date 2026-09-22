import { defineSuite, registerEvals } from '@evalkit/core';

import { greetingEval } from '../evals/greeting.eval.js';
import { piGreetingEval } from '../evals/pi-greeting.eval.js';

export default registerEvals([
  defineSuite({
    id: 'examples.starter',
    name: 'Starter Example',
    evals: [greetingEval, piGreetingEval],
  }),
]);
