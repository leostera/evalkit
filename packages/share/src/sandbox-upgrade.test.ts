import { expect, test } from 'bun:test';
import { withSandbox } from './transcripts.js';

const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const decode = (data: Uint8Array | undefined) =>
  JSON.parse(new TextDecoder().decode(data));

test('a 0.11 run records its sandbox instead of its isolation', () => {
  const files = new Map([
    [
      'detail.json',
      encode({
        manifest: {
          schemaVersion: 7,
          evalId: 'e',
          isolation: { kind: 'container', image: 'node:24', network: 'none' },
          runtime: 'local',
        },
      }),
    ],
    ['run.json', encode({ id: 'r', isolation: { kind: 'container' } })],
  ]);
  const upgraded = withSandbox(files);
  const sandbox = {
    id: 'container',
    kind: 'container',
    image: 'node:24',
    network: 'none',
  };
  expect(decode(upgraded.get('detail.json')).manifest).toEqual({
    schemaVersion: 8,
    evalId: 'e',
    sandbox,
  });
  expect(decode(upgraded.get('run.json'))).toEqual({ id: 'r', sandbox });
  // Already upgraded: unchanged.
  expect(withSandbox(upgraded)).toBe(upgraded);
});
