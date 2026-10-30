import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'locked-out',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('I am locked out after too many attempts.')],
  scoring: [mentions('15 minutes'), cites('locked-out'), greetsCustomer],
});
