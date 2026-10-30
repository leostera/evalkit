import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'two-factor',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('How do I turn on 2FA?')],
  scoring: [mentions('authenticator app'), cites('two-factor'), greetsCustomer],
});
