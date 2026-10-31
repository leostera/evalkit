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
  id: 'change-email',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('How do I change my login email?')],
  metrics: [replyLength],
  scoring: [mentions('confirmation link'), cites('email'), greetsCustomer],
});
