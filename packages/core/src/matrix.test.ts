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
test('excludes partial and overlapping patterns without double-counting', () => {
  const m = defineEvalMatrix({
    id,
    evals: [evaluation],
    parameters: {
      os: ['linux', 'macos', 'windows'],
      arch: ['arm64', 'x86_64'],
      spec: [true, false],
    },
    exclude: [
      { os: 'windows', arch: 'arm64' },
      { os: 'windows', arch: 'arm64', spec: true },
    ],
  });
  expect(m.count()).toBe(10);
  expect([...m.cells()]).toHaveLength(10);
  expect(m.count({ parameters: { os: ['windows'] } })).toBe(2);
  expect(m.count({ parameters: { os: ['windows'], arch: ['arm64'] } })).toBe(0);
  expect([
    ...m.cells({ parameters: { os: ['windows'], arch: ['arm64'] } }),
  ]).toEqual([]);
});

test('correlated cases cross independent axes, preserve keys and select case values', () => {
  const m = defineEvalMatrix({
    id,
    evals: [evaluation],
    cases: [
      { language: 'ruby', framework: 'rails' },
      { language: 'ruby', framework: null },
      { language: 'go', framework: 'gin' },
      { language: 'go', framework: null },
      { language: 'python', framework: 'fastapi' },
      { language: 'python', framework: null },
    ],
    parameters: { spec: ['detailed', 'none'], formalModel: [true, false] },
    exclude: [{ language: 'go', framework: 'gin', formalModel: true }],
    defaults: { turnBudget: 6 },
  });
  expect(m.count()).toBe(22);
  expect([...m.cells()]).toHaveLength(22);
  expect(
    m.count({ parameters: { language: ['ruby'], framework: ['rails'] } }),
  ).toBe(4);
  expect(
    m.count({ parameters: { framework: ['gin'], formalModel: [true] } }),
  ).toBe(0);
  const selected = [
    ...m.cells({
      parameters: { framework: [null], spec: ['none'], formalModel: [true] },
    }),
  ];
  expect(selected).toHaveLength(3);
  expect(selected[0]?.parameters).toEqual({
    turnBudget: 6,
    language: 'ruby',
    framework: null,
    formalModel: true,
    spec: 'none',
  });
  expect(new Set(selected.map((cell) => cell.key)).size).toBe(3);
  expect(() => m.count({ overrides: { language: 'ruby' } })).toThrow(
    'Select axis language',
  );
});

test('rejects malformed cases and ineffective exclusions before execution', () => {
  const base = {
    id,
    evals: [evaluation],
    parameters: { os: ['linux', 'windows'], arch: ['arm64'] },
  };
  expect(() => defineEvalMatrix({ ...base, cases: [] })).toThrow();
  expect(() =>
    defineEvalMatrix({
      ...base,
      cases: [{ language: 'ruby' }, { framework: 'rails' }],
    }),
  ).toThrow();
  expect(() =>
    defineEvalMatrix({
      ...base,
      cases: [{ language: 'ruby' }, { language: 'ruby' }],
    }),
  ).toThrow();
  expect(() =>
    defineEvalMatrix({ ...base, exclude: [{ os: 'macos' }] }),
  ).toThrow('matches no declared cell');
  expect(() =>
    defineEvalMatrix({ ...base, exclude: [{ typo: true }] }),
  ).toThrow('Unknown matrix exclude dimension');
  expect(() => defineEvalMatrix({ ...base, exclude: [{}] })).toThrow(
    'must specify a dimension',
  );
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
  const sparse = defineEvalMatrix({
    id,
    evals: [evaluation],
    parameters: { a: values, b: values, c: values },
    exclude: [{ a: 0, b: 0, c: 0 }],
  });
  expect(sparse.count()).toBe(999_999_999);
  expect(sparse.cells().next().value!.parameters).toEqual({ a: 0, b: 0, c: 1 });
});
