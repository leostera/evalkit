# EvalKit website

Static Astro site for EvalKit, deployed at **https://evalkit.leostera.dev** using the Cloudflare Worker `evalkit-www`.

From the monorepo root:

```sh
bun install
bun run --cwd sites/evalkit.leostera.dev dev       # local Astro development server
bun run --cwd sites/evalkit.leostera.dev check     # Astro/TypeScript checks
bun run --cwd sites/evalkit.leostera.dev build     # static site in sites/evalkit.leostera.dev/dist/
```

The site deploys with the Cloudflare CLI (`cf`). [`cloudflare.config.ts`](cloudflare.config.ts) names the Worker, its custom domain `evalkit.leostera.dev`, and 404 handling; [`wrangler.config.ts`](wrangler.config.ts) points at Astro's prerendered `dist/`. `bun run build` builds the site and then the Build Output in `.cloudflare/output/` (ignored by Git). There is no Worker script: Workers Static Assets serves the files. Deployment is manual, not automatic in CI. With access to the `leostera` Cloudflare account:

```sh
bun test scripts/website-snippets.test.ts
bun run --cwd sites/evalkit.leostera.dev check
cf auth whoami
cd sites/evalkit.leostera.dev && cf deploy --dry-run
cd sites/evalkit.leostera.dev && cf deploy
```

Verify the account before deployment. Build/check/preview commands alone do not publish anything. The homepage example test checks that its public-package definition stays synchronized with the generated starter.

The [getting-started guide](src/content/docs/index.md) and [manual chapters](src/content/docs/manual/) are Markdown pages rendered by Starlight at `/docs/` and `/docs/manual/`. Edit these sources when EvalKit's functionality changes. The homepage and 404 page use the developer-workbench Astro layout; Starlight supplies docs navigation, page search, and code highlighting. The homepage's interactive evidence is a labeled recording, not a live eval service. Its dashboard screenshot comes from the local repository greeting run; image provenance is embedded in the PNG. The newer generated-project code example is separately labeled. Public Sans is self-hosted with its OFL license under `public/fonts/`. The [Cloudflare config](cloudflare.config.ts) serves the static output only.
