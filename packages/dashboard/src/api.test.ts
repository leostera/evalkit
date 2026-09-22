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
                    uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b21',
                    uuid: '0197f17c-4d89-7f81-9d42-6c497e6f6b21',
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
        uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b21',
        uuid: '0197f17c-4d89-7f81-9d42-6c497e6f6b21',
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
          'https://evalkit.example/v1/runs/run-1/trials/a%2Fb/trajectory',
        );
        return new Response('', { status: 404 });
      },
    });

    await expect(api.getTrajectory('run-1', 'a/b')).rejects.toThrow(
      'Dashboard request failed: 404',
    );
  });
});
