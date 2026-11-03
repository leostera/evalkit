import { defineEval, user } from '@evalkit/core';
import { notesBuilder } from '../../agents/notes-builder.js';
import {
  builds,
  history,
  oneCommitPerSave,
  saves,
} from '../../judges/notes.js';

export default defineEval({
  id: 'versioned-notes',
  name: 'Versioned notes',
  agent: notesBuilder,
  transcript: [
    user('Build a notes service that keeps every save of a note as a commit.'),
    builds,
  ],
  scoring: [saves, history, oneCommitPerSave],
});
