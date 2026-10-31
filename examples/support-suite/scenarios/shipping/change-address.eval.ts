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
  id: 'change-address',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('I put the wrong address on my order.')],
  metrics: [replyLength],
  scoring: [
    mentions('until the order ships'),
    cites('address'),
    greetsCustomer,
  ],
});
