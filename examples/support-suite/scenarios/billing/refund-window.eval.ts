import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'refund-window',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('How long do I have to ask for a refund?')],
  scoring: [mentions('30 days'), cites('refunds'), greetsCustomer],
});
