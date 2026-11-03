import { defineEval, user } from '@evalkit/core';
import { docsAssistant } from '../../agents/docs-assistant.js';
import { expectations } from '../../datasets/chat.dataset.js';
import { citesDocs, correctness, tone } from '../../judges/chat.js';

export default defineEval({
  id: 'purge-single-url',
  name: 'Purge one URL from the cache',
  agent: docsAssistant,
  datasets: [expectations],
  transcript: [user('How do I purge one URL from the cache?')],
  scoring: [correctness('purge'), tone, citesDocs],
});
