import { expect, test } from 'bun:test';
import {
  addUsage,
  cacheHitRate,
  normalizeUsage,
  uncachedTokens,
  usageMetrics,
} from './usage.js';

test('usage is ATXF buckets: input, cache reads and writes, output; nothing reported is undefined', () => {
  expect(normalizeUsage(undefined)).toBeUndefined();
  expect(normalizeUsage({})).toBeUndefined();
  expect(normalizeUsage({ output: 20 })).toEqual({ input: 0, output: 20 });
  expect(normalizeUsage({ input: 10, cacheRead: 90, output: 5 })).toEqual({
    input: 10,
    cacheRead: 90,
    output: 5,
  });
  expect(() => normalizeUsage({ input: -1 })).toThrow(
    'Usage input must be a non-negative number',
  );
});

test('tokens leave out cache reads; a total-only usage counts its total', () => {
  expect(uncachedTokens({ input: 200, cacheRead: 800, output: 50 })).toBe(250);
  expect(uncachedTokens({ input: 10, cacheWrite: 40, output: 5 })).toBe(55);
  expect(uncachedTokens({ input: 0, output: 0, total: 30 })).toBe(30);
  expect(
    uncachedTokens({ input: 0, output: 0, total: 30, cacheRead: 10 }),
  ).toBe(20);
  expect(cacheHitRate({ input: 200, cacheRead: 800, output: 50 })).toBe(0.8);
  expect(cacheHitRate({ input: 0, output: 5 })).toBeUndefined();
  expect(
    addUsage({ input: 1, output: 2 }, { input: 3, output: 4, cacheRead: 5 }),
  ).toEqual({ input: 4, output: 6, cacheRead: 5 });
});

test('usage metrics sum each usage; no usage, no metrics', () => {
  expect(usageMetrics([])).toEqual([]);
  expect(
    usageMetrics([
      { input: 200, cacheRead: 800, output: 50 },
      { input: 0, output: 0, total: 30 },
    ]).map((metric) => [metric.name, metric.value]),
  ).toEqual([
    ['tokens', 280],
    ['cached tokens', 800],
    ['output tokens', 50],
    ['cache hit rate', 0.8],
  ]);
});
