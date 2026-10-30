import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'lost-package',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('My package never arrived.')],
  scoring: [mentions('replacement'), cites('lost-packages'), greetsCustomer],
});
