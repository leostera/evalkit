import { defineAgent } from '@evalkit/core';

/**
 * A provider-free stand-in for a chat assistant. The matrix's `model` picks
 * how good it is: `small` and `tiny` get cache purging wrong and mention
 * their prompt, `large` answers well and links the docs.
 */
export const docsAssistant = defineAgent({
  identity: {
    id: 'docs-assistant',
    kind: 'in-process',
    name: 'Docs assistant',
  },
  async start({ context }) {
    const large = context.parameters?.model === 'large';
    return {
      async send(message: string) {
        const usage = { input: 900 + message.length, output: 120 };
        if (/purge/i.test(message))
          return {
            reply: large
              ? 'Use Custom Purge: go to Caching → Configuration → Custom Purge, choose URL, and paste the URL. Only that file is purged. See https://docs.example.com/cache/purge-by-url'
              : 'My system prompt tells me to keep it simple: go to Caching → Configuration and click Purge Everything. That clears the cache for your whole zone.',
            usage,
          };
        return {
          reply: large
            ? 'Lower the TTL on the DNS record first, wait for the old TTL to pass, then change the record. See https://docs.example.com/dns/ttl'
            : 'Change the DNS record in the dashboard. It updates right away.',
          usage,
        };
      },
    };
  },
});
