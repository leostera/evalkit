import { expect, test } from 'bun:test';
import type { RunSummary } from '../api.js';
import { pivot, pivotAxes, pivotMeasures } from './pivot.js';

let minute = 0;
function run(
  parameters: Record<string, unknown>,
  status: RunSummary['status'],
  extra: Partial<RunSummary> = {},
): RunSummary {
  minute++;
  return {
    id: `run-${minute}`,
    evalId: 'zero-to-ocaml',
    parameters,
    status,
    startedAt: new Date(Date.UTC(2025, 0, 1, 0, minute)).toISOString(),
    completedTrials: 1,
    requestedTrials: 1,
    ...extra,
  };
}

const runs = [
  run({ model: 'glm', toolchain: 'dune', trials: 1 }, 'passed', { score: 1 }),
  run({ model: 'glm', toolchain: 'dune', trials: 1 }, 'failed', { score: 0 }),
  run({ model: 'glm', toolchain: 'opam', trials: 1 }, 'passed', { score: 1 }),
  run({ model: 'kimi', toolchain: 'dune', trials: 1 }, 'failed', {
    score: 0.5,
    metrics: [{ name: 'tokens', mean: 300, count: 3 }],
  }),
  run({ model: 'kimi', toolchain: 'dune', trials: 1 }, 'passed', {
    metrics: [{ name: 'tokens', mean: 100, count: 1 }],
  }),
  run({ model: 'kimi', toolchain: 'opam', trials: 1 }, 'running'),
];

test('only parameters that differ are axes', () => {
  expect(pivotAxes(runs)).toEqual(['model', 'toolchain']);
});

test('measures: pass rate, mean score, then recorded metrics', () => {
  expect(pivotMeasures(runs).map((entry) => entry.id)).toEqual([
    'pass-rate',
    'score',
    'metric:tokens',
  ]);
});

test('cells aggregate finished runs by one axis down and another across', () => {
  const table = pivot(runs, 'model', 'toolchain', { kind: 'pass-rate' });
  expect(table.rows.map((row) => row.label)).toEqual(['glm', 'kimi']);
  expect(table.columns.map((column) => column.label)).toEqual(['dune', 'opam']);
  const cell = (row: string, column: string) =>
    table.cells[JSON.stringify(row)]![JSON.stringify(column)];
  expect(cell('glm', 'dune')).toEqual({ runs: 2, value: 0.5 });
  expect(cell('glm', 'opam')).toEqual({ runs: 1, value: 1 });
  // The only kimi/opam run is still running, so it is not counted.
  expect(cell('kimi', 'opam')).toEqual({ runs: 0 });
});

test('without a column axis each row is one cell; metrics weight by trials measured', () => {
  const table = pivot(runs, 'model', undefined, {
    kind: 'metric',
    metric: { name: 'tokens', better: 'lower' },
  });
  expect(table.columns).toHaveLength(1);
  const [column] = table.columns;
  expect(table.cells[JSON.stringify('kimi')]![column!.key]).toEqual({
    runs: 2,
    value: 250,
  });
  expect(table.cells[JSON.stringify('glm')]![column!.key]).toEqual({ runs: 3 });
});

test('values follow the matrix order, then their labels', () => {
  const table = pivot(
    runs,
    'model',
    undefined,
    { kind: 'score' },
    {
      model: ['kimi', 'glm'],
    },
  );
  expect(table.rows.map((row) => row.label)).toEqual(['kimi', 'glm']);
  expect(table.cells[JSON.stringify('kimi')]).toEqual({
    [table.columns[0]!.key]: { runs: 2, value: 0.5 },
  });
});
