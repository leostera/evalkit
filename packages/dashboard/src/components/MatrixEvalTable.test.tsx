import { expect, test } from 'bun:test';
import { matrixEvalPage } from './MatrixEvalTable.js';

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
