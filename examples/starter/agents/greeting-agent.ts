import { defineAgent } from '@evalkit/core';

/** A deliberately tiny AUT owned by this example project. */
export const greetingAgent = defineAgent({
  identity: {
    name: 'Greeting Agent',
    kind: 'example',
    id: 'greeting-agent',
    version: '1',
  },
  async start() {
    return {
      // Returning the reply is enough: EvalKit records it as the assistant message.
      async send(message: string) {
        return `Hello from EvalKit: ${message}`;
      },
    };
  },
});
