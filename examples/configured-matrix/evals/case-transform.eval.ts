import { defineEval, user } from '@evalkit/core';
import { caseAgent } from '../agents/case-agent.js';
import { matchesCase } from '../judges/matches-case.js';

export default defineEval({
  id: 'case-transform',
  name: 'Apply the selected text style',
  agent: caseAgent,
  transcript: [user('Hello Evalkit')],
  scoring: [matchesCase],
});
