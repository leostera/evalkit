import { describe, expect, test } from 'bun:test';
import { defineAgent, defineEval, registerEvals } from '@evalkit/core';

import { createControlApi } from './worker.js';

const registry = registerEvals([
  defineEval({
    id: 'hello',
    name: 'Hello eval',
    agent: defineAgent({
      async start() {
        return { async send() {}, async close() {} };
      },
    }),
    transcript: [],
    scoring: [],
  }),
]);

const api = createControlApi({ registry });

function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  return api.fetch(new Request(`https://evalkit.test${path}`, init), {
    EVALKIT_API_TOKEN: 'project-token',
  });
}

describe('control API', () => {
  test('requires authentication before exposing eval metadata', async () => {
    const response = await fetchApi('/v1/evals');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized' } });
  });

  test('lists registry metadata to an authenticated caller', async () => {
    const response = await fetchApi('/v1/evals', {
      headers: { authorization: 'Bearer project-token' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      evals: [{ id: 'hello', name: 'Hello eval' }],
    });
  });

  test('authenticates unknown API routes before reporting route handling', async () => {
    const unauthorized = await fetchApi('/v1/runs', { method: 'POST' });
    const authenticated = await fetchApi('/v1/runs', {
      method: 'POST',
      headers: { authorization: 'Bearer project-token' },
    });

    expect(unauthorized.status).toBe(401);
    expect(authenticated.status).toBe(501);
  });

  test('does not expose a non-API route', async () => {
    const response = await fetchApi('/unrelated', {
      headers: { authorization: 'Bearer project-token' },
    });

    expect(response.status).toBe(404);
  });
});
