import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@evalkit/core';

/** Provider-free AUT that emits actual tool events and writes to the candidate workspace. */
export function fileAgent(options: { firstWrite?: string } = {}) {
  return defineAgent({
    identity: {
      id: 'file-agent',
      kind: 'in-process',
      name: 'Local file writer',
    },
    runtimes: { local: { kind: 'in-process' } },
    async start({ context, onEvent }) {
      let turn = 0;
      await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
      return {
        async send(message: string) {
          turn++;
          if (turn > 2) throw new Error('This example supports two turns');
          const requested = turn === 1 ? '2112' : '2113';
          const written =
            turn === 1 ? (options.firstWrite ?? requested) : requested;
          const timestamp = () => new Date().toISOString();
          await onEvent({ kind: 'turn-started', turn, timestamp: timestamp() });
          await onEvent({
            kind: 'tool-call',
            id: `write-${turn}`,
            name: 'write_file',
            arguments: { path: 'number.txt', contents: requested },
            timestamp: timestamp(),
          });
          // The failed variant intentionally writes the wrong content despite emitting the call.
          await writeFile(join(context.workspace.root, 'number.txt'), written);
          await onEvent({
            kind: 'tool-result',
            id: `write-${turn}`,
            result: { ok: written === requested },
            timestamp: timestamp(),
          });
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: `Wrote ${written} after: ${message}`,
            timestamp: timestamp(),
          });
          await onEvent({
            kind: 'turn-completed',
            turn,
            timestamp: timestamp(),
          });
        },
        async close() {
          await onEvent({
            kind: 'completed',
            timestamp: new Date().toISOString(),
          });
        },
      };
    },
  });
}
