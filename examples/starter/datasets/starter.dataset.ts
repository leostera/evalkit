import { defineDataset } from '@evalkit/core';

// Copied into each trial's workspace under starter/. Paths are relative to the project root.
export const starter = defineDataset({
  id: 'starter',
  name: 'Starter files',
  files: 'datasets/starter',
});
