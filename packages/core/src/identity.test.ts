import { describe, expect, test } from 'bun:test';

import { parseResourceUri, resourceUri, resourceUuid } from './identity.js';

const uuid = '0197f17c-4d89-7f81-9d42-6c497e6f6b6a';

describe('canonical resource URIs', () => {
  test('formats and parses typed canonical URIs', () => {
    const uri = resourceUri('trial', uuid);
    expect(uri).toBe(`evalkit:trial:${uuid}`);
    expect(parseResourceUri(uri, 'trial')).toEqual({
      kind: 'trial',
      uuid,
      uri,
    });
    expect(resourceUuid(uri, 'trial')).toBe(uuid);
  });

  test('rejects malformed UUIDs and wrong resource kinds', () => {
    expect(() => parseResourceUri('evalkit:trial:not-a-uuid')).toThrow();
    expect(() => parseResourceUri(`evalkit:eval:${uuid}`)).toThrow();
    expect(() => parseResourceUri(`evalkit:run:${uuid}`, 'trial')).toThrow(
      'Expected an EvalKit trial URI',
    );
  });
});
