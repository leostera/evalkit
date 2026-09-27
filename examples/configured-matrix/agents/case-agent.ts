import { defineAgent } from '@evalkit/core';

/** Local AUT: deliberately simple so a parameter sweep needs no model provider. */
export const caseAgent = defineAgent({
  identity: { id: 'case-agent', kind: 'in-process', name: 'Case agent' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context, onEvent }) {
    await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
    let turn = 0;
    return {
      async send(message: string) {
        turn += 1;
        const style = context.parameters?.style;
        if (style !== 'lower' && style !== 'upper')
          throw new Error(`Unknown style: ${String(style)}`);
        await onEvent({
          kind: 'turn-started',
          turn,
          timestamp: new Date().toISOString(),
        });
        await onEvent({
          kind: 'message',
          role: 'assistant',
          content:
            style === 'upper' ? message.toUpperCase() : message.toLowerCase(),
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
