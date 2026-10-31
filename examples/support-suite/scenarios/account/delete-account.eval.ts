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
  id: 'delete-account',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Please delete my account.')],
  metrics: [replyLength],
  scoring: [
    mentions('permanent after 14 days'),
    cites('delete-account'),
    greetsCustomer,
  ],
});
