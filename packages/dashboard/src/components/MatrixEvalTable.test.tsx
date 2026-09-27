import { expect, test } from 'bun:test';
import { filterMatrixRows, matrixEvalPage } from './MatrixEvalTable.js';

test('decodes a bounded page of eval × axis cells without generating the full matrix', () => {
  const axes: [string, unknown[]][] = [
    ['model', Array.from({ length: 23 }, (_, index) => `model-${index}`)],
    ['mode', ['without-docs', 'with-docs', 'with-skills', 'with-llms-txt']],
  ];
  const ids = Array.from({ length: 18 }, (_, index) => `task-${index}`);
  const first = matrixEvalPage(ids, axes, 0, 50);
  expect(first.total).toBe(18 * 23 * 4);
  expect(first.rows).toHaveLength(50);
  expect(first.rows[0]).toEqual({
    id: 'task-0',
    parameters: { model: 'model-0', mode: 'without-docs' },
    values: ['model-0', 'without-docs'],
  });
  expect(first.rows[49]?.parameters).toEqual({
    model: 'model-12',
    mode: 'with-docs',
  });
  const last = matrixEvalPage(ids, axes, 1650, 50);
  expect(last.rows).toHaveLength(6);
  expect(last.rows.at(-1)).toEqual({
    id: 'task-17',
    parameters: { model: 'model-22', mode: 'with-llms-txt' },
    values: ['model-22', 'with-llms-txt'],
  });
});

test('filters across all cells including off-page parameters and non-string values', () => {
  const axes: [string, unknown[]][] = [
    ['model', Array.from({ length: 51 }, (_, index) => `model-${index}`)],
    ['mode', ['without-docs', 'with-docs']],
    ['options', [{ retries: 1 }, { retries: 2 }]],
  ];
  const { rows } = matrixEvalPage(['echo'], axes, 0, 204);
  const matches = filterMatrixRows(
    rows,
    'model-50 with-docs retries":2',
    (row) => [row.id, ...row.values],
  );
  expect(matches).toHaveLength(1);
  expect(matches[0]?.parameters).toEqual({
    model: 'model-50',
    mode: 'with-docs',
    options: { retries: 2 },
  });
  expect(filterMatrixRows(rows, 'no-such-model', (row) => row.values)).toEqual(
    [],
  );
});

test('keeps non-string matrix values and a no-matrix eval as distinct cells', () => {
  const axes: [string, unknown[]][] = [
    ['profile', [{ docs: true }, { docs: false }]],
    ['seed', [1, 2]],
  ];
  expect(matrixEvalPage(['echo'], axes, 1, 2).rows).toEqual([
    {
      id: 'echo',
      parameters: { profile: { docs: true }, seed: 2 },
      values: [{ docs: true }, 2],
    },
    {
      id: 'echo',
      parameters: { profile: { docs: false }, seed: 1 },
      values: [{ docs: false }, 1],
    },
  ]);
  expect(matrixEvalPage(['echo'], [], 0, 50).rows).toEqual([
    { id: 'echo', parameters: {}, values: [] },
  ]);
});
