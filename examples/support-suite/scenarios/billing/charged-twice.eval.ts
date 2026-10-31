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
  id: 'charged-twice',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('I was charged twice this month!')],
  metrics: [replyLength],
  scoring: [
    mentions('reversed automatically'),
    cites('payments'),
    greetsCustomer,
  ],
});
