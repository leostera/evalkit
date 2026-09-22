import { defineAgent, defineEval, registerEvals } from '@evalkit/core';
import { createControlApi } from '../src/worker.js';

const registry = registerEvals([
  defineEval({
    uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b0f',
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
