import { defineConfig, type UserConfig } from 'tsdown';

const entries = [
  'src/index.ts',
  'src/runner.ts',
  'src/cli.ts',
  'src/share.ts',
  'src/share-worker.ts',
];

const shared: UserConfig = {
  platform: 'node',
  format: 'esm',
  deps: {
    // The workspace packages are implementation details, not consumer dependencies.
    alwaysBundle: [/^@evalkit\//],
    neverBundle: [
      'effect',
      'hono',
      /^hono\//,
      'jiti',
      'bun:sqlite',
      'node:sqlite',
    ],
  },
};

export default defineConfig([
  // JavaScript: one build, so entries share chunks and module instances.
  { ...shared, entry: entries, dts: false, clean: true },
  // Types: one build per entry, so each .d.mts reads on its own.
  ...entries.map((entry): UserConfig => ({
    ...shared,
    entry: [entry],
    dts: { emitDtsOnly: true },
    clean: false,
  })),
]);
