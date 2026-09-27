import { predicate } from '@evalkit/core';

export const greetingIsReturned = predicate(
  'returns a greeting',
  ({ trajectory }) => {
    const response = trajectory.events.find(
      (event) =>
        event.source === 'aut' &&
        event.kind === 'message' &&
        event.role === 'assistant',
    );
    return {
      value:
        response?.kind === 'message' &&
        response.content === 'Hello from EvalKit: Ada'
          ? 1
          : 0,
      explanation: 'The AUT should return the expected greeting.',
    };
  },
);
