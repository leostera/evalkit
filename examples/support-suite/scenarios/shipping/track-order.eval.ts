import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, greetsCustomer, mentions } from '../../judges/support.js';

export default defineEval({
  id: 'track-order',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('Where is my order? How do I track it?')],
  scoring: [mentions('tracking link'), cites('tracking'), greetsCustomer],
});
