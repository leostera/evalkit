import * as Schema from 'effect/Schema';
import type { TrajectoryEvent } from './index.js';
import { TrajectoryEventSchema } from './schema.js';

/** Decode one private report's JSONL trajectory; reject malformed/non-event lines with their line number. */
export function parseTrajectoryJsonl(contents: string): TrajectoryEvent[] {
  const events: TrajectoryEvent[] = [];
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(
        Schema.decodeUnknownSync(TrajectoryEventSchema)(JSON.parse(line)),
      );
    } catch (cause) {
      throw new Error(`Invalid trajectory JSONL at line ${index + 1}`, {
        cause,
      });
    }
  }
  return events;
}
