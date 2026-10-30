import { defineAgent } from '@evalkit/core';

/** Local AUT: deliberately simple so a parameter sweep needs no model provider. */
export const caseAgent = defineAgent({
  identity: { id: 'case-agent', kind: 'in-process', name: 'Case agent' },
  async start({ context }) {
    return {
      async send(message: string) {
        const style = context.parameters?.style;
        if (style !== 'lower' && style !== 'upper')
          throw new Error(`Unknown style: ${String(style)}`);
        return style === 'upper'
          ? message.toUpperCase()
          : message.toLowerCase();
      },
    };
  },
});
