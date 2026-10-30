import { predicate } from '@evalkit/core';

export const greetingIsReturned = predicate(
  'returns a greeting',
  ({ output }) => ({
    value: output === 'Hello from EvalKit: Ada' ? 1 : 0,
    explanation: 'The AUT should return the expected greeting.',
  }),
);
