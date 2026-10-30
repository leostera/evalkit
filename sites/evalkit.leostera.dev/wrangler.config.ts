import { defineWranglerConfig } from 'wrangler/experimental-config';

// Run `bun run build` first; `cf deploy` uploads the built site from dist/.
export default defineWranglerConfig({ assetsDirectory: './dist' });
