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
  test('rejects excluded or unpaired combinations even when each value is declared', () => {
    const constrained = defineEvalMatrix({
      id: 'platforms',
      evals: [{ id: 'echo' } as EvalDefinition],
      parameters: { os: ['windows', 'linux'], arch: ['arm64', 'x86_64'] },
      exclude: [{ os: 'windows', arch: 'arm64' }],
    });
    expect(() =>
      selectDashboardCell(constrained, 'echo', {
        os: 'windows',
        arch: 'arm64',
      }),
    ).toThrow('eligible cell');
    expect(
      constrained.count(
        selectDashboardCell(constrained, 'echo', {
          os: 'linux',
          arch: 'arm64',
        }),
      ),
    ).toBe(1);
    const correlated = defineEvalMatrix({
      id: 'languages',
      evals: [{ id: 'echo' } as EvalDefinition],
      parameters: { spec: [true, false] },
      cases: [
        { language: 'ruby', framework: 'rails' },
        { language: 'go', framework: 'gin' },
      ],
    });
    expect(() =>
      selectDashboardCell(correlated, 'echo', {
        language: 'ruby',
        framework: 'gin',
        spec: true,
      }),
    ).toThrow('eligible cell');
    expect(
      correlated.count(
        selectDashboardCell(correlated, 'echo', {
          language: 'ruby',
          framework: 'rails',
          spec: true,
        }),
      ),
    ).toBe(1);
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
