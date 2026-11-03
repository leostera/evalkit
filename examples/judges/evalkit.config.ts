import { defineConfig } from '@evalkit/core';
import { rulesJudge } from './agents/rules-judge.js';

export default defineConfig({
  // Every judge that names no agent uses this one.
  judge: rulesJudge,
  // Three agent models, all judged by a stronger judge model.
  matrix: {
    id: 'models',
    parameters: {
      model: ['tiny', 'small', 'large'],
      judgeModel: ['judge-large'],
    },
  },
});
