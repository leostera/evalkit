import { predicate } from '@evalkit/core';

export const matchesCase = predicate('matches selected style', ({ context, trajectory }) => {
  const reply = trajectory.events.filter(
    (event) => event.source === 'aut' && event.kind === 'message' && event.role === 'assistant',
  ).at(-1);
  const expected = context.parameters?.style === 'upper' ? 'HELLO EVALKIT' : 'hello evalkit';
  return {
    value: reply?.kind === 'message' && reply.content === expected ? 1 : 0,
    explanation: `Expected ${expected}`,
  };
});
