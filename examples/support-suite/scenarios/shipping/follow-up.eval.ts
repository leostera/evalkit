import { defineEval, user } from '@evalkit/core';
import { supportAgent } from '../../agents/support-agent.js';
import { customers, helpCenter } from '../../datasets/support.dataset.js';
import { cites, mentions, replyLength } from '../../judges/support.js';

export default defineEval({
  id: 'follow-up',
  name: 'Answers a follow-up question',
  agent: supportAgent,
  datasets: [helpCenter, customers],
  transcript: [
    user('How long does delivery take?'),
    mentions('3 to 5 business days'),
    user('And to other countries?'),
  ],
  metrics: [replyLength],
  scoring: [mentions('7 to 14 business days'), cites('international')],
  policy: { failfast: true },
});
