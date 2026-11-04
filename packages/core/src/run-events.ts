import * as Schema from 'effect/Schema';
import type { RunEvent } from './index.js';
import { RunEventSchema } from './schema.js';

/** Decodes a run's `run-events.jsonl`; a malformed line is an error naming its line number. */
export function parseRunEventsJsonl(contents: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(Schema.decodeUnknownSync(RunEventSchema)(JSON.parse(line)));
    } catch (cause) {
      throw new Error(`Invalid run event at line ${index + 1}`, { cause });
    }
  }
  return events;
}
