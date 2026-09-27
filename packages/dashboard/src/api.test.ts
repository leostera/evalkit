import { describe, expect, test } from 'bun:test';

import { createHttpDashboardApi } from './api.js';

describe('dashboard HTTP API', () => {
  test('uses versioned endpoints and parses API envelopes', async () => {
    const requests: Request[] = [];
    const api = createHttpDashboardApi({
      baseUrl: 'https://evalkit.example/',
      fetch: async (input) => {
        requests.push(new Request(input));
        return Response.json(
          new URL(input.toString()).pathname === '/v1/evals'
            ? {
                evals: [
                  {
                    id: 'eval-21',
                    name: 'Support',
                  },
                ],
              }
            : { runs: [] },
        );
      },
    });

    await expect(api.listEvals()).resolves.toEqual([
      {
        id: 'eval-21',
        name: 'Support',
      },
    ]);
    await expect(api.listRuns()).resolves.toEqual([]);
    expect(requests.map((request) => request.url)).toEqual([
      'https://evalkit.example/v1/evals',
      'https://evalkit.example/v1/runs',
    ]);
  });

  test('encodes trial IDs and surfaces HTTP errors', async () => {
    const api = createHttpDashboardApi({
      baseUrl: 'https://evalkit.example',
      fetch: async (input) => {
        expect(input.toString()).toBe(
          'https://evalkit.example/v1/runs/run-1/trials/a%2Fb/events',
        );
        return new Response('', { status: 404 });
      },
    });

    await expect(api.getTrialEvents('run-1', 'a/b')).rejects.toThrow(
      'Dashboard request failed: 404',
    );
  });
});
