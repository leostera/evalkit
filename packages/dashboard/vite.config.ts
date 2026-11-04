import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Chunks loaded from JavaScript (the highlighter's grammars) are found
  // next to the chunk that loads them, so the dashboard works under any
  // mount path (`/share/…`). index.html keeps `/assets/`, which snapshots
  // and the share server rewrite.
  experimental: {
    renderBuiltUrl: (_file, { hostType }) =>
      hostType === 'js' ? { relative: true } : undefined,
  },
  // `bun run dev` here hot-reloads the UI against a running `evalkit dev` API.
  server: {
    proxy: {
      '/v1': `http://localhost:${process.env.EVALKIT_API_PORT ?? 4317}`,
    },
  },
});
