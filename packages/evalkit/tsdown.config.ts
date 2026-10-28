import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/runner.ts',
    'src/cli.ts',
    'src/share.ts',
    'src/share-worker.ts',
  ],
  platform: 'node',
  format: 'esm',
  dts: true,
  clean: true,
  deps: {
    // The workspace packages are implementation details, not consumer dependencies.
    alwaysBundle: [/^@evalkit\//],
    neverBundle: ['effect', 'hono', /^hono\//, 'bun:sqlite'],
  },
});
