import { describe, expect, test } from 'bun:test';

import { parseResourceUri, resourceUri, resourceUuid } from './identity.js';

const uuid = '0197f17c-4d89-7f81-9d42-6c497e6f6b6a';

describe('canonical resource URIs', () => {
  test('formats and parses typed canonical URIs', () => {
    const uri = resourceUri('run', uuid);
    expect(uri).toBe(`evalkit:run:${uuid}`);
    expect(parseResourceUri(uri, 'run')).toEqual({
      kind: 'run',
      uuid,
      uri,
    });
    expect(resourceUuid(uri, 'run')).toBe(uuid);
  });

  test('rejects malformed UUIDs and wrong resource kinds', () => {
    expect(() => parseResourceUri('evalkit:run:not-a-uuid')).toThrow();
    expect(() => parseResourceUri(`evalkit:eval:${uuid}`)).toThrow();
    expect(() => parseResourceUri(`evalkit:run:${uuid}`, 'artifact')).toThrow(
      'Expected an EvalKit artifact URI',
    );
    // Trials are runs since schema version 6.
    expect(() => parseResourceUri(`evalkit:trial:${uuid}`)).toThrow();
  });
});
