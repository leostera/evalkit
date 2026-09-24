import { defineConfig } from 'astro/config';

// All pages are prerendered. Cloudflare serves dist/ as Workers Static Assets;
// no server adapter, Worker script, or runtime bindings are needed.
export default defineConfig({
  site: 'https://evalkit.leostera.dev',
  output: 'static',
});
