import { predicate } from '@evalkit/core';

export const matchesCase = predicate(
  'matches selected style',
  ({ context, output }) => {
    const expected =
      context.parameters?.style === 'upper' ? 'HELLO EVALKIT' : 'hello evalkit';
    return {
      value: output === expected ? 1 : 0,
      explanation: `Expected ${expected}`,
    };
  },
);
