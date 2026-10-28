import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `bun run dev` here hot-reloads the UI against a running `evalkit dev` API.
  server: {
    proxy: {
      '/v1': `http://localhost:${process.env.EVALKIT_API_PORT ?? 4317}`,
    },
  },
});
