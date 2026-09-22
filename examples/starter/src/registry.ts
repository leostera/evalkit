import { defineSuite, registerEvals } from '@evalkit/core';

import { greetingEval } from '../evals/greeting.eval.js';
import { piGreetingEval } from '../evals/pi-greeting.eval.js';

export default registerEvals([
  defineSuite({
    uri: 'evalkit:suite:0197f17c-4d89-7f81-9d42-6c497e6f6b10',
    name: 'Starter Example',
    evals: [greetingEval, piGreetingEval],
  }),
]);
