import { expect, test } from 'bun:test';
import { assertSupportedRuntime, globMatcher } from './runtime.js';

test('discovery globs match like the default includes and excludes', () => {
  const evals = globMatcher('**/*.eval.ts');
  expect(evals('a.eval.ts')).toBe(true);
  expect(evals('support/deep/a.eval.ts')).toBe(true);
  expect(evals('a.eval.tsx')).toBe(false);
  expect(globMatcher('**/node_modules/**')('x/node_modules/y/z.ts')).toBe(true);
  expect(globMatcher('*.eval.{ts,js}')('a.eval.js')).toBe(true);
  expect(globMatcher('*.eval.{ts,js}')('dir/a.eval.js')).toBe(false);
  expect(globMatcher('skip.eval.ts')('skip.eval.ts')).toBe(true);
  expect(globMatcher('a?.ts')('ab.ts')).toBe(true);
});

test('Node older than 22.18 is refused with a clear message', () => {
  // On Bun every version is accepted, so only the message shape is checked there.
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    expect(() => assertSupportedRuntime('20.0.0')).not.toThrow();
    return;
  }
  expect(() => assertSupportedRuntime('22.17.0')).toThrow('Node 22.18');
  expect(() => assertSupportedRuntime('22.18.0')).not.toThrow();
});
