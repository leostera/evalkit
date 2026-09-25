import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  check,
  defineEval,
  expectToolCall,
  predicate,
  user,
} from '@evalkit/core';
import { fileAgent } from '../agents/file-agent.js';

// A complete two-turn scenario: both intermediate and final file states pass.
export default defineEval({
  id: 'write-revise',
  agent: fileAgent(),
  transcript: [
    user('Write 2112 into number.txt.'),
    check(
      'first reply',
      ({ turn }) => typeof turn.lastAssistantText === 'string',
    ),
    expectToolCall({
      name: 'write_file',
      arguments: { path: 'number.txt', contents: '2112' },
    }),
    check('first file version', async ({ artifacts }) => {
      const content = await readFile(
        join(artifacts.candidate.root, 'number.txt'),
        'utf8',
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      return content === '2112';
    }),
    user('Revise number.txt to 2113.'),
    check('revised file version', async ({ artifacts, turn }) => {
      const content = await readFile(
        join(artifacts.candidate.root, 'number.txt'),
        'utf8',
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      return (
        turn.lastAssistantText?.includes('2113') === true && content === '2113'
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
    }),
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
    ),
  ],
  policy: { failfast: true },
});
