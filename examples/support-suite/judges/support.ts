import { metric, predicate, skip } from '@evalkit/core';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The reply contains every phrase, so the answer carries the facts that matter. */
export const mentions = (...phrases: string[]) =>
  predicate(`mentions ${phrases.join(', ')}`, ({ output }) => {
    const missing = phrases.filter((phrase) => !text(output).includes(phrase));
    return {
      value: (phrases.length - missing.length) / phrases.length,
      explanation: missing.length
        ? `Missing: ${missing.join(', ')}`
        : 'Mentions everything',
    };
  });

/** The agent read the article the answer belongs to. Without one, nothing to check. */
export const cites = (article?: string) =>
  predicate(`cites ${article ?? 'no article'}`, ({ trajectory }) => {
    if (!article) return skip('no article answers this question');
    return trajectory.events.some(
      (event) =>
        event.kind === 'tool-call' &&
        event.name === 'read_article' &&
        typeof event.arguments === 'object' &&
        event.arguments !== null &&
        !Array.isArray(event.arguments) &&
        event.arguments.article === article,
    );
  });

/** The reply opens with the customer's name, in the tone of the matrix cell. */
export const greetsCustomer = predicate(
  'greets the customer in tone',
  ({ context, data, output }) => {
    const customer = data.customers;
    const name =
      typeof customer === 'object' && customer && !Array.isArray(customer)
        ? text(customer.name)
        : '';
    const expected =
      context.parameters?.tone === 'formal' ? `Dear ${name},` : `Hi ${name}!`;
    return {
      value: name && text(output).startsWith(expected) ? 1 : 0,
      explanation: `Expected the reply to start with "${expected}"`,
    };
  },
);

/** Unanswerable questions are handed to a person, as the escalation policy says. */
export const escalates = predicate(
  'hands off to a person',
  ({ data, output }) => {
    const policy = data['escalation-policy'];
    const handoff =
      typeof policy === 'object' && policy && !Array.isArray(policy)
        ? text(policy.handoff)
        : '';
    return Boolean(handoff) && text(output).includes(handoff);
  },
);

/** Measured, never pass/fail: shorter answers that still pass are better. */
export const replyLength = metric(
  'reply length',
  ({ output }) => (typeof output === 'string' ? output.length : undefined),
  { unit: 'chars', better: 'lower' },
);
