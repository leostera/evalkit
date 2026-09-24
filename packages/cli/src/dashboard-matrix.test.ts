import { describe, expect, test } from 'bun:test';
import { defineEvalMatrix, type EvalDefinition } from '@evalkit/core';
import { selectDashboardCell } from './dashboard-matrix.js';

const matrix = defineEvalMatrix({
  id: 'benchmark',
  evals: [{ id: 'echo' } as EvalDefinition, { id: 'cron' } as EvalDefinition],
  parameters: { model: ['glm', 'scout'], mode: ['with-docs', 'without-docs'] },
});

describe('dashboard matrix run safety', () => {
  test('runs only one explicitly selected cell', () => {
    const selection = selectDashboardCell(matrix, 'echo', {
      model: 'glm',
      mode: 'with-docs',
    });
    expect(matrix.count(selection)).toBe(1);
    expect(
      [...matrix.cells(selection)].map((cell) => [
        cell.eval.id,
        cell.parameters,
      ]),
    ).toEqual([['echo', { model: 'glm', mode: 'with-docs' }]]);
  });
  test('rejects missing, invalid, or unconfigured axes and evals', () => {
    for (const parameters of [
      undefined,
      {},
      { model: 'glm' },
      { model: 'glm', mode: 'with-docs', extra: 'x' },
      { model: 'other', mode: 'with-docs' },
      { model: ['glm', 'scout'], mode: 'with-docs' },
    ]) {
      expect(() => selectDashboardCell(matrix, 'echo', parameters)).toThrow();
    }
    expect(() =>
      selectDashboardCell(matrix, 'unknown', {
        model: 'glm',
        mode: 'with-docs',
      }),
    ).toThrow();
  });
});
