import { describe, expect, test } from 'bun:test';

import { constantTimeEqualUtf8, hasBearerToken } from './auth.js';

describe('Worker bearer authentication', () => {
  test('accepts exactly one matching bearer token', async () => {
    const request = new Request('https://evalkit.example/v1/runs', {
      headers: { authorization: 'Bearer project-secret' },
    });

    expect(await hasBearerToken(request, 'project-secret')).toBe(true);
  });

  test.each([
    undefined,
    '',
    'Basic project-secret',
    'Bearer',
    'Bearer ',
    'Bearer project-secret extra',
    'bearer project-secret',
    'Bearer wrong-secret',
  ])(
    'rejects a missing or malformed authorization header: %p',
    async (value) => {
      const headers = new Headers();
      if (value !== undefined) headers.set('authorization', value);
      const request = new Request('https://evalkit.example/v1/runs', {
        headers,
      });

      expect(await hasBearerToken(request, 'project-secret')).toBe(false);
    },
  );

  test('rejects a request if the Worker secret is not configured', async () => {
    const request = new Request('https://evalkit.example/v1/runs', {
      headers: { authorization: 'Bearer project-secret' },
    });

    expect(await hasBearerToken(request, undefined)).toBe(false);
  });

  test('compares complete UTF-8 values', async () => {
    expect(await constantTimeEqualUtf8('token-🔐', 'token-🔐')).toBe(true);
    expect(await constantTimeEqualUtf8('token-🔐', 'token-🔑')).toBe(false);
    expect(await constantTimeEqualUtf8('short', 'a much longer value')).toBe(
      false,
    );
  });
});
