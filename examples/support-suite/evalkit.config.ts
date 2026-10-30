import { defineConfig } from '@evalkit/core';

export default defineConfig({
  // Every scenario in scenarios/ runs in both tones; each directory is a suite.
  matrix: { id: 'tone', parameters: { tone: ['friendly', 'formal'] } },
  execution: { concurrency: 8, trials: 2, maxCells: 100 },
});
