# EvalKit website

Static Astro site for EvalKit. It is intended to live at `https://evalkit.leostera.dev`, but is **not deployed** by this repository's setup.

From the monorepo root:

```sh
bun install
bun run --cwd www dev       # local Astro development server
bun run --cwd www check     # Astro/TypeScript checks
bun run --cwd www build     # static site in www/dist/
```

The Cloudflare Workers configuration is [`wrangler.jsonc`](wrangler.jsonc). It serves Astro's prerendered `dist/` via Workers Static Assets; no Cloudflare Astro SSR adapter or Worker script is necessary. `workers_dev` is explicitly `false` and the intended Custom Domain is `evalkit.leostera.dev`. A future deployment will need access to the Cloudflare account that owns the `leostera.dev` zone; verify hostname availability and account permissions before deploying. No deploy script or CI deployment is configured. Running local build/check/preview commands does not publish the site.

The [getting-started guide](src/content/docs/index.md) and [manual chapters](src/content/docs/manual/) are Markdown pages rendered by Starlight at `/docs/` and `/docs/manual/`. Edit these sources when EvalKit's functionality changes. The homepage and 404 page retain the custom editorial Astro layout; Starlight supplies docs navigation, page search, and code highlighting. The [Cloudflare Workers Static Assets config](wrangler.jsonc) still serves the static output only.
