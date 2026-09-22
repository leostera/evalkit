import { defineAgent } from '@evalkit/core';

/** A deliberately tiny AUT owned by this example project. */
export const greetingAgent = defineAgent({
  identity: { kind: 'example', id: 'greeting-agent', version: '1' },
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
