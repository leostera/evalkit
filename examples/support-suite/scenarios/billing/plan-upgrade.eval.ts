import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'plan-upgrade',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('When does a plan upgrade apply?')],
  scoring: [mentions('at once'), cites('plans'), greetsCustomer],
});
