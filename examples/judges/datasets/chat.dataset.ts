import { defineDataset } from '@evalkit/core';

/** What a good answer does, per question. Only scorers and judges see it. */
export const expectations = defineDataset({
  id: 'expectations',
  name: 'Expected behaviour',
  visibility: 'evaluator',
  value: {
    purge: 'Explain Custom Purge by single URL, not Purge Everything.',
    ttl: 'Lower the TTL before changing the record, then wait for the old TTL.',
  },
});
