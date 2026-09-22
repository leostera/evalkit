import type { EvalRegistry } from '@evalkit/core';

import { hasBearerToken } from './auth.js';

export type ControlApiEnv = {
  EVALKIT_API_TOKEN?: string;
};

export type ControlApiOptions = {
  registry: EvalRegistry;
};

/**
 * The project-owned HTTP control plane. Route implementations are added in
 * phases; this boundary consistently authenticates every API route first.
 */
export function createControlApi(options: ControlApiOptions) {
  return {
    async fetch(request: Request, env: ControlApiEnv): Promise<Response> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/v1/')) {
        return json({ error: { code: 'not_found' } }, 404);
      }

      if (!(await hasBearerToken(request, env.EVALKIT_API_TOKEN))) {
        return json({ error: { code: 'unauthorized' } }, 401);
      }

      if (request.method === 'GET' && url.pathname === '/v1/evals') {
        return json({ evals: options.registry.metadata() });
      }

      return json({ error: { code: 'not_implemented' } }, 501);
    },
  };
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
