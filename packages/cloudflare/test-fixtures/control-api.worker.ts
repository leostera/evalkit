import { defineAgent, defineEval, registerEvals } from '@evalkit/core';
import { createControlApi } from '../src/worker.js';

const registry = registerEvals([
  defineEval({
    id: 'eval-0f',
    agent: defineAgent({
      async start() {
        return { async send() {}, async close() {} };
      },
    }),
    transcript: [],
    scoring: [],
  }),
]);

export default createControlApi({ registry });
