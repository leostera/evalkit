import { defineConfig } from '@evalkit/core';

export default defineConfig({
  matrix: {
    id: 'letter-case',
    parameters: { style: ['lower', 'upper'] },
  },
  execution: { concurrency: 2, maxCells: 4 },
});
