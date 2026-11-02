import { createShareApp } from './app.js';
import { r2Files, type R2BucketLike } from './files.js';
import { durableObjectIndex } from './index-do.js';

export { ShareIndexObject as ShareIndex } from './index-do.js';

/**
 * Bindings for a share server Worker: RESULTS (R2), INDEX (SQLite Durable
 * Object, class ShareIndex), and ASSETS (static assets: the bundled
 * dashboard). Optional `vars`: BASE_PATH serves it below a path such as
 * `/evals`, and REPO (a key such as `github.com/acme/agents`) turns on
 * single-repository mode. See `ShareAppOptions`.
 */
export type ShareEnv = {
  RESULTS: R2BucketLike;
  INDEX: Parameters<typeof durableObjectIndex>[0];
  ASSETS: { fetch(request: Request): Promise<Response> };
  BASE_PATH?: string;
  REPO?: string;
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
      ...(env.BASE_PATH ? { basePath: env.BASE_PATH } : {}),
      ...(env.REPO ? { repo: env.REPO } : {}),
    });
    return app.fetch(request);
  },
};
