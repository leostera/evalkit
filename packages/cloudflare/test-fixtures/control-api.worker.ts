import { defineAgent, defineEval, registerEvals } from '@evalkit/core';
import { createControlApi } from '../src/worker.js';

const registry = registerEvals([
  defineEval({
    id: 'miniflare-example',
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
