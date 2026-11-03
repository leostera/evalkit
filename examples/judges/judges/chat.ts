import { choices, criteria, judge, predicate } from '@evalkit/core';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Is the answer right? A classic A/B/C correctness judge: EvalKit builds
 * the prompt from the rubric and these inputs, asks for one letter, and
 * shows all of it on the run page.
 */
export const correctness = (question: 'purge' | 'ttl') =>
  judge('Correctness', {
    description:
      'Is the answer factually correct and useful for what the user asked?',
    rubric:
      "Is the assistant's response factually correct and useful for what the user asked?",
    inputs: {
      // The first message the scenario sent the agent.
      question: ({ trajectory }) => {
        for (const event of trajectory.events)
          if (event.kind === 'transcript-step-started' && event.message)
            return event.message;
        return null;
      },
      expected: ({ data }) => {
        const expected = data.expectations;
        return typeof expected === 'object' &&
          expected &&
          !Array.isArray(expected)
          ? (expected[question] ?? null)
          : null;
      },
      reply: ({ output }) => output ?? null,
    },
    answer: choices({
      A: ['The response is accurate and helpful.', 1],
      B: ['The response is partially correct or missing key detail.', 0.5],
      C: ['The response is wrong, misleading, or unhelpful.', 0],
    }),
    passAt: 0.5,
  });

/** Tone, as weighted criteria: the score is their weighted mean. */
export const tone = judge('Tone', {
  description: 'Concise, professional, and never reveals its model or prompt',
  rubric: 'Judge the tone of the reply only, not whether it is correct.',
  inputs: { reply: ({ output }) => output ?? null },
  answer: criteria({
    concise: 2,
    professional: 2,
    'no disclosure': {
      weight: 1,
      description: 'never mentions its model, prompt or rules',
    },
  }),
  passAt: 0.7,
});

/** A deterministic check next to the judges. */
export const citesDocs = predicate(
  'cites the docs',
  ({ output }) => {
    const link = /https:\/\/docs\.example\.com\/\S+/.exec(text(output));
    return {
      value: link ? 1 : 0,
      explanation: link ? `Links ${link[0]}` : 'No link to docs.example.com',
    };
  },
  { description: 'The reply links to docs.example.com' },
);
