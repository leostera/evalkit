import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@evalkit/core';

/**
 * A provider-free stand-in for a coding agent that builds a versioned notes
 * service. Instead of a Worker it writes the store its service would keep,
 * `notes.json`: every save of every note, as commits. With `model: small` it
 * loses the first save of a note, the kind of bug the checks must explain.
 */
export const notesBuilder = defineAgent({
  identity: { id: 'notes-builder', kind: 'in-process', name: 'Notes builder' },
  async start({ context }) {
    const lossy = context.parameters?.model === 'small';
    return {
      async send() {
        const saves = [
          ['a', 'first draft'],
          ['a', 'second draft'],
          ['b', 'an unrelated note'],
          ['a', 'final text'],
        ] as const;
        const commits = saves
          .map(([id, text], index) => ({
            id,
            text,
            version: `${(index + 1).toString(16).padStart(2, '0')}c41d9e7f0a`,
          }))
          .filter((_, index) => !(lossy && index === 0));
        await writeFile(
          join(context.workspace.root, 'notes.json'),
          JSON.stringify({ commits }, null, 2),
        );
        return {
          reply: 'Built the notes service; notes.json holds its commits.',
          toolCalls: [
            {
              name: 'write_file',
              arguments: { path: 'notes.json' },
              result: { ok: true },
            },
          ],
          usage: { inputTokens: 2400, outputTokens: 640 },
        };
      },
    };
  },
});
