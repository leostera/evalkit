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
  id: 'cancel-subscription',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('How do I cancel my subscription?')],
  metrics: [replyLength],
  scoring: [mentions('Cancel', 'keep access'), cites('cancel'), greetsCustomer],
});
