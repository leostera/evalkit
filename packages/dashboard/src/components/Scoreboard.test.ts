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
  expect(row?.metrics).toEqual({ 'agent time': 325, 'web searches': 2 });
  expect(metricColumns(runs).map((column) => column.name)).toEqual([
    'agent time',
    'web searches',
  ]);
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
