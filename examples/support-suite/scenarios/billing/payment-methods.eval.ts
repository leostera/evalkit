import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'payment-methods',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Can I pay with PayPal?')],
  scoring: [mentions('PayPal'), cites('payments'), greetsCustomer],
});
