import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'international',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Do you ship to other countries?')],
  scoring: [mentions('40 countries'), cites('international'), greetsCustomer],
});
