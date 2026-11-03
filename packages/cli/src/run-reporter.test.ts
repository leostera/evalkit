import { expect, test } from 'bun:test';
import { defineAgent, defineEval, predicate, user } from '@evalkit/core';
import { firstLine } from './dashboard-reports.js';
import { verdictReason } from './run-reporter.js';

const scenario = defineEval({
  id: 'reasons',
  agent: defineAgent({
    identity: { id: 'quiet', kind: 'in-process' },
    async start() {
      return { send: async () => 'ok' };
    },
  }),
  transcript: [user('hi')],
  scoring: [predicate('checks', () => true)],
});

test('a summary line is the first line of a message, without terminal colours', () => {
  const stderr = `\u001b[31m✘ [ERROR]\u001b[0m Could not resolve "hono"\n\n  src/index.ts:1:17:\n${'    at frame\n'.repeat(300)}`;
  expect(firstLine(stderr)).toBe('✘ [ERROR] Could not resolve "hono" …');
  expect(firstLine('\n\n  ok  \n')).toBe('ok');
  expect(firstLine('x'.repeat(200), 20)).toBe(`${'x'.repeat(19)}…`);
  expect(firstLine(undefined)).toBe('');
});

test('checks that were never reached read as one cause, not as failures', () => {
  expect(
    verdictReason(scenario, {
      name: 'service',
      value: 0,
      passAt: 1,
      explanation: '\u001b[2mThe worker did not start\u001b[0m\nlong stderr…',
      criteria: [
        { name: 'saves', reached: false },
        { name: 'history', reached: false },
      ],
    }),
  ).toBe(
    'service 0.0 (passes at 1): not reached saves, history · The worker did not start …',
  );
  expect(
    verdictReason(scenario, {
      name: 'service',
      value: 0.5,
      passAt: 1,
      criteria: [
        { name: 'saves', value: 1 },
        { name: 'idempotent', value: 0, explanation: 'an extra repo exists' },
      ],
    }),
  ).toBe('service 0.5 (passes at 1): failed idempotent (an extra repo exists)');
});
