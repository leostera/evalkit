import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineEval, expectToolCall, predicate, user } from '@evalkit/core';
import { fileAgent } from '../agents/file-agent.js';

// The AUT emits the expected call but writes the wrong file. The first file check
// fails, so failfast prevents the revision even though the call check passed.
export default defineEval({
  id: 'failfast-file',
  agent: fileAgent({ firstWrite: 'wrong' }),
  transcript: [
    user('Write 2112 into number.txt.'),
    predicate(
      'first reply',
      ({ turn }) => typeof turn?.lastAssistantText === 'string',
    ),
    expectToolCall({
      name: 'write_file',
      arguments: { path: 'number.txt', contents: '2112' },
    }),
    predicate('first file version', async ({ artifacts }) => {
      const content = await readFile(
        join(artifacts.candidate.root, 'number.txt'),
        'utf8',
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      return content === '2112';
    }),
    user('Revise number.txt to 2113.'), // skipped when the first file check fails
    predicate('revised file version', async ({ artifacts, turn }) => {
      const content = await readFile(
        join(artifacts.candidate.root, 'number.txt'),
        'utf8',
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      return (
        turn?.lastAssistantText?.includes('2113') === true && content === '2113'
      );
    }),
  ],
  scoring: [
    predicate('final file is 2113', async ({ artifacts }) => {
      const content = await readFile(
        join(artifacts.candidate.root, 'number.txt'),
        'utf8',
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      return Number(content === '2113');
    }), // skipped after failfast: this predicate needs the final file
    predicate(
      'first turn was observed',
      ({ trajectory }) =>
        Number(
          trajectory.events.some(
            (event) =>
              event.source === 'aut' &&
              event.kind === 'tool-call' &&
              event.id === 'write-1',
          ),
        ),
      { supportsPartial: true },
    ), // runs after failfast, but cannot erase the failed check
  ],
  policy: { failfast: true },
});
