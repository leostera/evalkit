import { toJson } from './json.js';
import type { AutEvent, RecordedError, Usage } from './index.js';

/**
 * Events as adapters emit them. Payloads accept any JSON-convertible value and
 * timestamps are optional; EvalKit converts them once into `AutEvent`s.
 */
export type AutEventInput =
  | { kind: 'started'; timestamp?: string }
  | {
      kind: 'message';
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: unknown;
      timestamp?: string;
    }
  | {
      kind: 'tool-call';
      id: string;
      name: string;
      arguments?: unknown;
      timestamp?: string;
    }
  | {
      kind: 'tool-result';
      id: string;
      name?: string;
      result?: unknown;
      timestamp?: string;
    }
  | { kind: 'turn-started'; turn: number; timestamp?: string }
  | {
      kind: 'turn-completed';
      turn: number;
      timestamp?: string;
      latencyMs?: number;
      usage?: Usage;
    }
  | { kind: 'completed'; output?: unknown; timestamp?: string }
  | { kind: 'error'; error: RecordedError; timestamp?: string };

export type TurnToolCall = {
  name: string;
  arguments?: unknown;
  /** When given, a `tool-result` event is recorded after the call. */
  result?: unknown;
  id?: string;
};

/** What `send()` may return instead of (or as well as) emitting events. A string is the reply. */
export type TurnResult =
  | string
  | {
      reply?: unknown;
      toolCalls?: readonly TurnToolCall[];
      usage?: Usage;
    };

/** Converts an adapter event into a recorded `AutEvent`. */
export function normalizeAutEvent(
  input: AutEventInput,
  now: () => Date,
): AutEvent {
  if (typeof input !== 'object' || input === null)
    throw new Error('AUT events must be objects');
  const timestamp = input.timestamp ?? now().toISOString();
  switch (input.kind) {
    case 'message':
      return {
        kind: 'message',
        role: input.role,
        content: toJson(input.content, 'event.content'),
        timestamp,
      };
    case 'tool-call':
      return {
        kind: 'tool-call',
        id: input.id,
        name: input.name,
        arguments:
          input.arguments === undefined
            ? {}
            : toJson(input.arguments, 'event.arguments'),
        timestamp,
      };
    case 'tool-result':
      return {
        kind: 'tool-result',
        id: input.id,
        ...(input.name === undefined ? {} : { name: input.name }),
        result:
          input.result === undefined
            ? null
            : toJson(input.result, 'event.result'),
        timestamp,
      };
    case 'completed':
      return {
        kind: 'completed',
        ...(input.output === undefined
          ? {}
          : { output: toJson(input.output, 'event.output') }),
        timestamp,
      };
    case 'started':
    case 'turn-started':
    case 'turn-completed':
    case 'error':
      return { ...input, timestamp } as AutEvent;
    default:
      throw new Error(
        `Unknown AUT event kind: ${String((input as { kind?: unknown }).kind)}`,
      );
  }
}

/**
 * The events a returned turn result stands for: each tool call (and its
 * result), then the reply, then the usage as a `turn-completed` event.
 */
export function turnResultEvents(
  result: TurnResult,
  turn: number,
  now: () => Date,
): AutEvent[] {
  if (typeof result === 'string') result = { reply: result };
  if (typeof result !== 'object' || result === null)
    throw new Error('send() must return nothing, a string, or a turn result');
  const events: AutEvent[] = [];
  for (const [index, call] of (result.toolCalls ?? []).entries()) {
    const id = call.id ?? `turn-${turn}-call-${index + 1}`;
    events.push(
      normalizeAutEvent(
        { kind: 'tool-call', id, name: call.name, arguments: call.arguments },
        now,
      ),
    );
    if (call.result !== undefined)
      events.push(
        normalizeAutEvent(
          { kind: 'tool-result', id, name: call.name, result: call.result },
          now,
        ),
      );
  }
  if (result.reply !== undefined)
    events.push(
      normalizeAutEvent(
        { kind: 'message', role: 'assistant', content: result.reply },
        now,
      ),
    );
  if (result.usage)
    events.push(
      normalizeAutEvent(
        { kind: 'turn-completed', turn, usage: result.usage },
        now,
      ),
    );
  return events;
}
