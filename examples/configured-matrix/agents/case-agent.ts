import { defineAgent } from '@evalkit/core';

/** Local AUT: deliberately simple so a parameter sweep needs no model provider. */
export const caseAgent = defineAgent({
  identity: { id: 'case-agent', kind: 'in-process', name: 'Case agent' },
  async start({ context, attach }) {
    const log: string[] = [];
    return {
      async send(message: string) {
        const style = context.parameters?.style;
        if (style !== 'lower' && style !== 'upper')
          throw new Error(`Unknown style: ${String(style)}`);
        const reply =
          style === 'upper' ? message.toUpperCase() : message.toLowerCase();
        log.push(`> ${message}`, `< ${reply}`);
        return reply;
      },
      // The agent's own log is saved with the results, even when the
      // passing run's sandbox is removed.
      async close() {
        await attach('case-agent.log', `${log.join('\n')}\n`);
      },
    };
  },
});
