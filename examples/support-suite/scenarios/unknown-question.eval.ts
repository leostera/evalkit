import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../agents/support-agent.js';
import * as data from '../datasets/support.dataset.js';
import {
  cites,
  escalates,
  greetsCustomer,
  replyLength,
} from '../judges/support.js';

export default defineEval({
  id: 'unknown-question',
  name: 'Hands off what it cannot answer',
  agent: supportAgent,
  datasets: [data.helpCenter, data.customers, data.escalationPolicy],
  transcript: [user('What is the meaning of life?')],
  metrics: [replyLength],
  scoring: [escalates, cites(), greetsCustomer],
});
