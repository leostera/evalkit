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
  id: 'reset-password',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('I forgot my password.')],
  metrics: [replyLength],
  scoring: [
    mentions('Forgot password', '1 hour'),
    cites('passwords'),
    greetsCustomer,
  ],
});
