import { predicate } from '@evalkit/core';

function randomNumberFrom(trajectory: {
  events: readonly { source: string; kind: string; content?: unknown }[];
}): number | undefined {
  const message = trajectory.events.find(
    (event) =>
      event.source === 'aut' &&
      event.kind === 'message' &&
      typeof event.content === 'string',
  );
  if (!message || typeof message.content !== 'string') return undefined;
  const match = message.content.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

/** Scores how close Pi's chosen number is to seven. */
export const piNumberCloseToSevenJudge = predicate(
  'number is close to 7',
  async ({ trajectory }) => {
    const number = randomNumberFrom(trajectory);
    if (number === undefined)
      return {
        value: 0,
        passed: false,
        explanation: 'The AUT did not return a number from 0 to 10.',
      };
    const distance = Math.abs(number - 7);
    return {
      value: Math.max(0, 1 - distance / 7),
      passed: distance <= 2,
      explanation: `${number} is ${distance} away from 7.`,
      evidence: { number, target: 7, distance },
    };
  },
);

/** Treats numbers from zero to ten as a coolness scale. */
export const piNumberCoolnessJudge = predicate(
  'number is cool',
  async ({ trajectory }) => {
    const number = randomNumberFrom(trajectory);
    if (number === undefined)
      return {
        value: 0,
        passed: false,
        explanation: 'The AUT did not return a number from 0 to 10.',
      };
    const value = Math.max(0, Math.min(10, number)) / 10;
    return {
      value,
      passed: number >= 7,
      explanation: `${number} scores ${value * 10}/10 on the coolness scale.`,
      evidence: { number, scale: '0-10' },
    };
  },
);
