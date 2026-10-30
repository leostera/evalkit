import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'refund-method',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Where does my refund money go back to?')],
  scoring: [
    mentions('original payment method'),
    cites('refunds'),
    greetsCustomer,
  ],
});
