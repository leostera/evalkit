import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../agents/support-agent.js';
import { customers, helpCenter } from '../datasets/support.dataset.js';
import { greetsCustomer } from '../judges/support.js';

export default defineEval({
  id: 'greeting',
  name: 'Greets the customer by name',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Hello there')],
  scoring: [greetsCustomer],
});
