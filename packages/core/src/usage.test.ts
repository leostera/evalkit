import { expect, test } from 'bun:test';
import { turnTokens } from './usage.js';

test('tokens are input plus output, cached input included; the total is a fallback', () => {
  expect(turnTokens(undefined)).toBeUndefined();
  expect(turnTokens({})).toBeUndefined();
  expect(
    turnTokens({ inputTokens: 1000, cachedInputTokens: 800, outputTokens: 50 }),
  ).toBe(1050);
  // The provider's total is not used when input and output are known.
  expect(
    turnTokens({ inputTokens: 100, outputTokens: 20, totalTokens: 999 }),
  ).toBe(120);
  expect(turnTokens({ outputTokens: 20 })).toBe(20);
  expect(turnTokens({ totalTokens: 30 })).toBe(30);
});
