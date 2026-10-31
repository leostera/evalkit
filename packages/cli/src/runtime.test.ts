import { expect, test } from 'bun:test';
import { globMatcher } from '@evalkit/core';
import { assertSupportedRuntime, serve, serveFromPort } from './runtime.js';

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

test('serveFromPort moves past ports that are taken', async () => {
  const ok = () => new Response('ok');
  const taken = await serve(ok, 0);
  try {
    const next = await serveFromPort(ok, taken.port);
    try {
      expect(next.port).toBeGreaterThan(taken.port);
      const response = await fetch(`http://localhost:${next.port}/`);
      expect(await response.text()).toBe('ok');
    } finally {
      await next.stop();
    }
    await expect(serveFromPort(ok, taken.port, 1)).rejects.toThrow(
      `Ports ${taken.port}–${taken.port} are all in use`,
    );
  } finally {
    await taken.stop();
  }
});
