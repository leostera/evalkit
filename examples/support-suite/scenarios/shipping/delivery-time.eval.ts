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
  id: 'delivery-time',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('How long does delivery take?')],
  metrics: [replyLength],
  scoring: [
    mentions('3 to 5 business days'),
    cites('delivery'),
    greetsCustomer,
  ],
});
