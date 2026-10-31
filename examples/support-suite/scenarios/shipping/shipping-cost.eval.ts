import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import {
  cites,
  greetsCustomer,
  mentions,
  replyLength,
} from '../../judges/support.js';

export default defineEval({
  id: 'shipping-cost',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Is shipping free?')],
  metrics: [replyLength],
  scoring: [mentions('50 euros'), cites('shipping-costs'), greetsCustomer],
});
