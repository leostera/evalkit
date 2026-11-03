import { defineEval, user } from '@evalkit/core';
import { docsAssistant } from '../../agents/docs-assistant.js';
import { expectations } from '../../datasets/chat.dataset.js';
import { correctness, tone } from '../../judges/chat.js';

export default defineEval({
  id: 'dns-ttl',
  name: 'Change a DNS record without downtime',
  agent: docsAssistant,
  datasets: [expectations],
  transcript: [user('How do I change a DNS record without downtime?')],
  scoring: [correctness('ttl'), tone],
});
