import { expect, test } from 'bun:test';
import { defineEvalMatrix, type EvalDefinition } from './index.js';
const evaluation: EvalDefinition = {
  id: 'task',
  agent: {
    async start() {
      return { async send() {}, async close() {} };
    },
  },
  transcript: [],
  scoring: [],
};
const id = 'test-matrix';
test('matrix selects before expansion and rejects unknown/duplicate dimensions', () => {
  const m = defineEvalMatrix({
    id,
    evals: [evaluation],
    parameters: { model: ['a', 'b'], mode: ['x', 'y'] },
    defaults: { maxTokens: 4 },
  });
  const selected = {
    parameters: { model: ['b'] },
    overrides: { maxTokens: 10 },
  };
  expect(m.count(selected)).toBe(2);
  expect([...m.cells(selected)].map((c) => c.parameters)).toEqual([
    { maxTokens: 10, mode: 'x', model: 'b' },
    { maxTokens: 10, mode: 'y', model: 'b' },
  ]);
  expect(() => m.count({ parameters: { model: ['unknown'] } })).toThrow();
  expect(() => m.count({ overrides: { model: 'a' } })).toThrow();
  expect(() =>
    defineEvalMatrix({ id, evals: [evaluation], parameters: { x: [1, 1] } }),
  ).toThrow();
});
test('keys are canonical and ignore display names and key insertion order', () => {
  const a = defineEvalMatrix({
    id,
    evals: [evaluation],
    parameters: { a: [{ y: 1, x: 2 }], b: [3] },
  });
  const b = defineEvalMatrix({
    id,
    evals: [{ ...evaluation, name: 'renamed' }],
    parameters: { b: [3], a: [{ x: 2, y: 1 }] },
  });
  expect(a.cells().next().value!.key).toBe(b.cells().next().value!.key);
});
test('large matrix yields a single cell without creating the Cartesian array', () => {
  const values = Array.from({ length: 1000 }, (_, i) => i);
  const m = defineEvalMatrix({
    id,
    evals: [evaluation],
    parameters: { a: values, b: values, c: values },
  });
  expect(m.count()).toBe(1_000_000_000);
  expect(m.cells().next().value!.parameters).toEqual({ a: 0, b: 0, c: 0 });
});
