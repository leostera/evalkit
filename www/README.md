# Evalkit website

Static Astro site for Evalkit. It is intended to live at `https://evalkit.leostera.dev`, but is **not deployed** by this repository's setup.

From the monorepo root:

```sh
bun install
bun run --cwd www dev       # local Astro development server
bun run --cwd www check     # Astro/TypeScript checks
bun run --cwd www build     # static site in www/dist/
```

The Cloudflare Workers configuration is [`wrangler.jsonc`](wrangler.jsonc). It serves Astro's prerendered `dist/` via Workers Static Assets; no Cloudflare Astro SSR adapter or Worker script is necessary. `workers_dev` is explicitly `false` and the intended Custom Domain is `evalkit.leostera.dev`. A future deployment will need access to the Cloudflare account that owns the `leostera.dev` zone; verify hostname availability and account permissions before deploying. No deploy script or CI deployment is configured. Running local build/check/preview commands does not publish the site.

The complete manual is maintained in [`src/content/manual.md`](src/content/manual.md) and rendered at `/docs/manual/` during the Astro build. The shorter getting started page is a separate overview; keep it in sync when Evalkit's functionality changes.
