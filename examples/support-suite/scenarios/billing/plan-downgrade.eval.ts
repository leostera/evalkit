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
  id: 'plan-downgrade',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('If I downgrade my plan, when does it change?')],
  metrics: [replyLength],
  scoring: [
    mentions('end of the billing period'),
    cites('plans'),
    greetsCustomer,
  ],
});
