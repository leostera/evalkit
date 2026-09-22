import { defineAgent } from '@evalkit/core';

/** A deliberately tiny AUT owned by this example project. */
export const greetingAgent = defineAgent({
  identity: {
    name: 'Greeting Agent',
    kind: 'example',
    uri: 'evalkit:agent:0197f17c-4d89-7f81-9d42-6c497e6f6b11',
    version: '1',
  },
  runtimes: {
    local: { kind: 'in-process' },
  },
  async start({ onEvent }) {
    await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
    let turn = 0;
    return {
      async send(message: string) {
        turn += 1;
        const timestamp = new Date().toISOString();
        await onEvent({ kind: 'turn-started', turn, timestamp });
        await onEvent({
          kind: 'message',
          role: 'assistant',
          content: `Hello from Evalkit: ${message}`,
          timestamp: new Date().toISOString(),
        });
        await onEvent({
          kind: 'turn-completed',
          turn,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {
        await onEvent({
          kind: 'completed',
          timestamp: new Date().toISOString(),
        });
      },
    };
  },
});
