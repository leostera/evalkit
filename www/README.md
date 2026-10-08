# EvalKit website

Static Astro site for EvalKit, deployed at **https://evalkit.leostera.dev** using the Cloudflare Worker `evalkit-www`.

From the monorepo root:

```sh
bun install
bun run --cwd www dev       # local Astro development server
bun run --cwd www check     # Astro/TypeScript checks
bun run --cwd www build     # static site in www/dist/
```

The Cloudflare Workers configuration is [`wrangler.jsonc`](wrangler.jsonc). It serves Astro's prerendered `dist/` via Workers Static Assets; no Cloudflare Astro SSR adapter or Worker script is necessary. `workers_dev` is explicitly `false`; the Custom Domain is `evalkit.leostera.dev`. Deployment is manual, not automatic in CI. With access to the `leostera` Cloudflare account:

```sh
bun test scripts/website-snippets.test.ts
bun run --cwd www check
bun run --cwd www build
bun run --cwd www wrangler whoami
bun run --cwd www wrangler deploy --dry-run
bun run --cwd www wrangler deploy --keep-vars --strict
```

Verify the account before deployment. Build/check/preview commands alone do not publish anything. The homepage example test checks that its public-package definition stays synchronized with the generated starter.

The [getting-started guide](src/content/docs/index.md) and [manual chapters](src/content/docs/manual/) are Markdown pages rendered by Starlight at `/docs/` and `/docs/manual/`. Edit these sources when EvalKit's functionality changes. The homepage and 404 page use the developer-workbench Astro layout; Starlight supplies docs navigation, page search, and code highlighting. The homepage's interactive evidence is a labeled recording, not a live eval service. Its dashboard screenshot comes from the local repository greeting run; image provenance is embedded in the PNG. The newer generated-project code example is separately labeled. Public Sans is self-hosted with its OFL license under `public/fonts/`. The [Cloudflare Workers Static Assets config](wrangler.jsonc) still serves the static output only.
