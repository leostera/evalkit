import { expect, test } from 'bun:test';
import { defineEvalMatrix, type EvalDefinition } from '@evalkit/core';
import { listMatrixCells } from './dashboard-cells.js';

const evals = [
  {
    id: 'api',
    name: 'HTTP API',
    agent: { identity: { kind: 'local', id: 'api' } },
  } as EvalDefinition,
];
const matrix = defineEvalMatrix({
  id: 'languages',
  evals,
  cases: [
    { language: 'ruby', framework: 'rails' },
    { language: 'ruby', framework: null },
    { language: 'go', framework: 'gin' },
  ],
  parameters: { spec: [true, false] },
  exclude: [{ language: 'go', spec: false }],
});
const query = {
  evalIds: ['api'],
  query: '',
  offset: 0,
  limit: 50,
  sort: 'eval',
  direction: 'asc' as const,
};

test('dashboard pages and filters the same eligible cells as core', () => {
  const all = listMatrixCells(matrix, query);
  expect(all.total).toBe(5);
  expect(all.planned).toBe(matrix.count({ evals: ['api'] }));
  expect(all.cells).toHaveLength(5);
  expect(
    all.cells.some(
      (cell) =>
        cell.parameters.language === 'go' && cell.parameters.spec === false,
    ),
  ).toBe(false);
  const matched = listMatrixCells(matrix, {
    ...query,
    query: 'ruby rails false',
  });
  expect(matched.total).toBe(1);
  expect(matched.cells[0]?.parameters).toEqual({
    language: 'ruby',
    framework: 'rails',
    spec: false,
  });
  const first = listMatrixCells(matrix, {
    ...query,
    sort: 'axis:spec',
    direction: 'desc',
    limit: 2,
  });
  expect(first.cells).toHaveLength(2);
  expect(first.cells.every((cell) => cell.parameters.spec === true)).toBe(true);
  const next = listMatrixCells(matrix, {
    ...query,
    sort: 'axis:spec',
    direction: 'desc',
    offset: 2,
    limit: 2,
  });
  expect(next.cells).toHaveLength(2);
  expect(
    new Set([...first.cells, ...next.cells].map((cell) => cell.key)).size,
  ).toBe(4);
});

test('dashboard rejects invalid pages and unbounded large matrix scans', () => {
  expect(() => listMatrixCells(matrix, { ...query, offset: -1 })).toThrow(
    'offset',
  );
  expect(() => listMatrixCells(matrix, { ...query, sort: 'unknown' })).toThrow(
    'sort',
  );
  const huge = defineEvalMatrix({
    id: 'huge',
    evals,
    parameters: {
      a: Array.from({ length: 1000 }, (_, i) => i),
      b: Array.from({ length: 1000 }, (_, i) => i),
    },
    exclude: [{ a: 0, b: 0 }],
  });
  expect(() => listMatrixCells(huge, query)).toThrow('narrow the selection');
});
