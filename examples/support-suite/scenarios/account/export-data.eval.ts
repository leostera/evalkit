import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'export-data',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Can I export a copy of my data?')],
  scoring: [mentions('24 hours'), cites('export'), greetsCustomer],
});
