import { Hono } from 'hono';
import type { EvalRegistry } from '@evalkit/core';

import { hasBearerToken } from './auth.js';

export type ControlApiEnv = {
  EVALKIT_API_TOKEN?: string;
};

export type ControlApiOptions = {
  registry: EvalRegistry;
};

/**
 * Creates the project-owned Hono control API. The same route factory can be
 * mounted by a Worker or exercised directly in tests.
 */
export function createControlApi(options: ControlApiOptions) {
  const app = new Hono<{ Bindings: ControlApiEnv }>();

  app.use('/v1/*', async (context, next) => {
    if (
      !(await hasBearerToken(context.req.raw, context.env.EVALKIT_API_TOKEN))
    ) {
      return context.json({ error: { code: 'unauthorized' } }, 401);
    }
    await next();
  });

  app.get('/v1/catalog', (context) =>
    context.json({ evals: options.registry.catalog() }),
  );
  app.get('/v1/evals', (context) =>
    context.json({ evals: options.registry.metadata() }),
  );
  app.get('/v1/suites', (context) =>
    context.json({ suites: options.registry.suiteMetadata() }),
  );

  // The coordinator/D1 projection will replace this empty initial source.
  // Keeping the envelope stable lets the dashboard ship before scheduling.
  app.get('/v1/runs', (context) => context.json({ runs: [] }));

  app.all('/v1/*', (context) =>
    context.json({ error: { code: 'not_implemented' } }, 501),
  );

  return {
    fetch(request: Request, env: ControlApiEnv): Promise<Response> {
      return Promise.resolve(app.fetch(request, env));
    },
  };
}
