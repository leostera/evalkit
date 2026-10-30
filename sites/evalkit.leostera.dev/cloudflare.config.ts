import { defineConfig } from 'cf/config';

// The static site, served by Workers Static Assets; there is no Worker script.
export default defineConfig({
  worker: {
    name: 'evalkit-www',
    compatibilityDate: '2026-09-24',
    domains: ['evalkit.leostera.dev'],
    assets: { notFoundHandling: '404-page' },
    observability: { enabled: true, traces: { enabled: true } },
  },
});
