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

async function candidateText(root: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, 'number.txt'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error; // Unexpected I/O is an execution error, not a failed assertion.
  }
}

export function writeRevise(id: string, agent: ReturnType<typeof fileAgent>) {
  return defineEval({
    id,
    agent,
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
      check(
        'first file version',
        async ({ artifacts }) =>
          (await candidateText(artifacts.candidate.root)) === '2112',
      ),
      user('Revise number.txt to 2113.'),
      check(
        'revised file version',
        async ({ artifacts, turn }) =>
          turn.lastAssistantText?.includes('2113') === true &&
          (await candidateText(artifacts.candidate.root)) === '2113',
      ),
    ],
    scoring: [
      predicate('final file is 2113', async ({ artifacts }) =>
        Number((await candidateText(artifacts.candidate.root)) === '2113'),
      ),
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
}
