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
  id: 'invoice-download',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [user('How do I download an invoice?')],
  metrics: [replyLength],
  scoring: [mentions('PDF'), cites('invoices'), greetsCustomer],
});
