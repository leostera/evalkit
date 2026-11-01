import { expect, test } from 'bun:test';
import type { RunSummary } from '../api.js';
import { metricColumns, metricTint, scoreboardRows } from './Scoreboard.js';

const run = (overrides: Partial<RunSummary>): RunSummary => ({
  id: crypto.randomUUID(),
  evalId: 'zero-to-ocaml',
  status: 'passed',
  startedAt: '2026-10-30T10:00:00Z',
  completedTrials: 1,
  requestedTrials: 1,
  ...overrides,
});

test('rows average score and metrics over finished runs, weighted by trials measured', () => {
  const runs = [
    run({
      score: 1,
      metrics: [
        {
          name: 'agent time',
          unit: 'ms',
          better: 'lower',
          builtIn: true,
          mean: 100,
          count: 1,
        },
        { name: 'web searches', better: 'lower', mean: 2, count: 1 },
      ],
    }),
    run({
      score: 0.5,
      startedAt: '2026-10-30T11:00:00Z',
      metrics: [
        {
          name: 'agent time',
          unit: 'ms',
          better: 'lower',
          builtIn: true,
          mean: 400,
          count: 3,
        },
      ],
    }),
    // Still running: left out of the means.
    run({
      status: 'running',
      startedAt: '2026-10-30T12:00:00Z',
      metrics: [{ name: 'agent time', unit: 'ms', mean: 9999, count: 1 }],
    }),
  ];
  const [row] = scoreboardRows([], [], runs);
  expect(row?.meanScore).toBe(0.75);
  expect(row?.finished).toBe(2);
  // web searches is new: the older run did not measure it, so it is "1 of 2", not a zero.
  expect(row?.metrics).toEqual({
    'agent time': { mean: 325, runs: 2 },
    'web searches': { mean: 2, runs: 1 },
  });
  expect(metricColumns(runs).map((column) => column.name)).toEqual([
    'agent time',
    'web searches',
  ]);
});

test('runs from before metrics existed are not measured, not zero', () => {
  const runs = [
    run({ startedAt: '2026-10-01T10:00:00Z' }),
    run({ startedAt: '2026-10-02T10:00:00Z', metrics: [] }),
    run({
      startedAt: '2026-10-03T10:00:00Z',
      metrics: [{ name: 'tool calls', mean: 4, count: 2, trials: 2 }],
    }),
  ];
  const [row] = scoreboardRows([], [], runs);
  expect(row?.metrics).toEqual({ 'tool calls': { mean: 4, runs: 1 } });
  expect(row?.finished).toBe(3);
  expect(scoreboardRows([], [], runs.slice(0, 2))[0]?.metrics).toEqual({});
});

test('metric cells are green at the better end and red at the worse one', () => {
  const lower = { name: 'tokens', better: 'lower' as const };
  const range = { min: 10, max: 30 };
  expect(metricTint(10, lower, range)).toBe('bg-kumo-success-tint');
  expect(metricTint(30, lower, range)).toBe('bg-kumo-danger-tint');
  expect(metricTint(30, { ...lower, better: 'higher' }, range)).toBe(
    'bg-kumo-success-tint',
  );
  // No direction, or nothing to compare: uncoloured.
  expect(metricTint(30, { name: 'tool calls' }, range)).toBe('');
  expect(metricTint(10, lower, { min: 10, max: 10 })).toBe('');
});
