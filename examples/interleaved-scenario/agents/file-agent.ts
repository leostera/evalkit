import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@evalkit/core';

/** Provider-free AUT that records real tool calls and writes to the candidate workspace. */
export function fileAgent(options: { firstWrite?: string } = {}) {
  return defineAgent({
    identity: {
      id: 'file-agent',
      kind: 'in-process',
      name: 'Local file writer',
    },
    async start({ context, transcript }) {
      let turn = 0;
      return {
        async send(message: string) {
          turn++;
          if (turn > 2) throw new Error('This example supports two turns');
          const requested = turn === 1 ? '2112' : '2113';
          const written =
            turn === 1 ? (options.firstWrite ?? requested) : requested;
          const id = `write-${turn}`;
          transcript.assistant({
            content: [
              {
                type: 'tool_call',
                id,
                name: 'write_file',
                arguments: { path: 'number.txt', contents: requested },
              },
            ],
          });
          // The failed variant intentionally writes the wrong content despite recording the call.
          await writeFile(join(context.workspace.root, 'number.txt'), written);
          transcript.toolResult(
            id,
            { ok: written === requested },
            { name: 'write_file' },
          );
          transcript.assistant({
            content: `Wrote ${written} after: ${message}`,
          });
        },
      };
    },
  });
}
