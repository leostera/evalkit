import { expect, test } from 'bun:test';
import type { RunSummary } from '../api.js';
import { invocationSummaries } from './InvocationTable.js';

const run = (id: string, extra: Partial<RunSummary>): RunSummary => ({
  id,
  evalId: id,
  status: 'passed',
  startedAt: '2026-01-01T00:00:00.000Z',
  completedTrials: 1,
  requestedTrials: 1,
  ...extra,
});

test('groups runs by invocation, newest first, and counts outcomes', () => {
  const summaries = invocationSummaries([
    run('a', {
      invocationId: 'one',
      suiteId: 'support',
      completedAt: '2026-01-01T00:00:05.000Z',
    }),
    run('b', { invocationId: 'one', status: 'failed', suiteId: 'billing' }),
    run('c', {
      invocationId: 'two',
      startedAt: '2026-01-02T00:00:00.000Z',
      status: 'cancelled',
    }),
    run('d', {}),
  ]);
  expect(summaries.map((summary) => summary.id)).toEqual(['two', 'one']);
  expect(summaries[1]).toMatchObject({
    suites: ['billing', 'support'],
    runs: 2,
    passed: 1,
    failed: 1,
    durationMs: 5000,
  });
  expect(summaries[0]!.cancelled).toBe(1);
});
