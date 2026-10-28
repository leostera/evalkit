import { createShareApp } from './app.js';
import { r2Files, type R2BucketLike } from './files.js';
import { durableObjectIndex } from './index-do.js';

export { ShareIndexObject as ShareIndex } from './index-do.js';

/**
 * Bindings for a share server Worker (see `wrangler.jsonc` in this package):
 * RESULTS (R2), INDEX (SQLite Durable Object, class ShareIndex), and ASSETS
 * (static assets: the bundled dashboard, with `run_worker_first: true`).
 */
export type ShareEnv = {
  RESULTS: R2BucketLike;
  INDEX: Parameters<typeof durableObjectIndex>[0];
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  fetch(request: Request, env: ShareEnv): Promise<Response> | Response {
    const asset = (path: string) =>
      env.ASSETS.fetch(new Request(new URL(path, 'https://assets.local')));
    const app = createShareApp({
      files: r2Files(env.RESULTS),
      index: durableObjectIndex(env.INDEX),
      assets: {
        // Static assets redirect /index.html to /, so ask for / directly.
        index: async () => (await asset('/')).text(),
        get: async (path) => {
          const response = await asset(`/assets/${path}`);
          return response.ok ? response : null;
        },
      },
    });
    return app.fetch(request);
  },
};
