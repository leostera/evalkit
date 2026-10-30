import type { TrajectoryEvent } from '../api.js';

/** Milliseconds since the trajectory's first event. */
type Offset = number;

export type EventError = { name?: string; message: string; stack?: string };

export type CheckpointState =
  'running' | 'passed' | 'failed' | 'skipped' | 'error';

/** One thing worth reading in a trajectory; lifecycle bookkeeping is folded away. */
export type TrajectoryItem =
  | { type: 'user'; at: Offset; text: string }
  | { type: 'assistant'; at: Offset; content: unknown }
  /** System and tool-role messages. */
  | { type: 'message'; at: Offset; role: string; content: unknown }
  | {
      type: 'tool';
      at: Offset;
      id: string;
      name: string;
      arguments?: unknown;
      /** Absent while the call has no recorded result. */
      result?: { value: unknown; durationMs: number };
    }
  | {
      type: 'checkpoint';
      at: Offset;
      step: number;
      name: string;
      state: CheckpointState;
      error?: EventError;
      durationMs?: number;
    }
  | { type: 'skipped-step'; at: Offset; step: number }
  | { type: 'error'; at: Offset; source: string; error: EventError }
  /** The AUT's final output, when it differs from its last reply. */
  | { type: 'output'; at: Offset; output: unknown }
  /** A kind this dashboard does not know; shown as-is. */
  | { type: 'unknown'; at: Offset; event: TrajectoryEvent };

export type TurnUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/** The events from one user message up to the next. */
export type TrajectoryTurn = {
  /** The AUT's turn number, when it reported one. */
  turn?: number;
  latencyMs?: number;
  usage?: TurnUsage;
  items: TrajectoryItem[];
};

export type ScorerRun = {
  name: string;
  value?: number;
  skipped: boolean;
  error?: EventError;
  durationMs?: number;
};

export type TrajectoryView = {
  /** Events before the first user message (usually empty). */
  preamble: TrajectoryItem[];
  turns: TrajectoryTurn[];
  scorers: ScorerRun[];
  /** First to last event. */
  durationMs?: number;
};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function eventError(value: unknown): EventError {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return {
      name: str(record.name),
      message: str(record.message) ?? JSON.stringify(value),
      stack: str(record.stack),
    };
  }
  return { message: String(value) };
}

function usage(value: unknown): TurnUsage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const result: TurnUsage = {
    inputTokens: num(record.inputTokens),
    outputTokens: num(record.outputTokens),
    totalTokens: num(record.totalTokens),
  };
  return Object.values(result).some((entry) => entry !== undefined)
    ? result
    : undefined;
}

/** Bookkeeping events whose meaning the view already shows in other ways. */
const FOLDED = new Set([
  'trial-started',
  'trial-completed',
  'started',
  'transcript-step-completed',
]);

/**
 * Turns raw trajectory events into what a reader wants: the conversation,
 * tool calls paired with their results, and checkpoints as single verdicts.
 */
export function trajectoryView(
  events: readonly TrajectoryEvent[],
): TrajectoryView {
  const times = events.map((event) => Date.parse(event.timestamp));
  const start = times.find((time) => !Number.isNaN(time)) ?? 0;
  const offset = (index: number) => {
    const time = times[index]!;
    return Number.isNaN(time) ? 0 : Math.max(0, time - start);
  };
  const preamble: TrajectoryItem[] = [];
  const turns: TrajectoryTurn[] = [];
  const scorers = new Map<string, ScorerRun>();
  const scorerStarts = new Map<string, Offset>();
  const tools = new Map<string, Extract<TrajectoryItem, { type: 'tool' }>>();
  const checkpoints = new Map<
    number,
    Extract<TrajectoryItem, { type: 'checkpoint' }>
  >();
  let lastReply: unknown;
  /** Set once the open turn was started by a recorded user message. */
  let promptOnly = false;
  const current = () => turns.at(-1)?.items ?? preamble;
  const openTurn = () => {
    turns.push({ items: [] });
    promptOnly = false;
    return turns.at(-1)!;
  };

  events.forEach((event, index) => {
    const at = offset(index);
    if (FOLDED.has(event.kind)) return;
    switch (event.kind) {
      case 'transcript-step-started': {
        const text = str(event.message);
        if (text === undefined) return;
        openTurn().items.push({ type: 'user', at, text });
        promptOnly = true;
        return;
      }
      case 'turn-started': {
        const turn = num(event.turn);
        // Older trajectories have no recorded prompt: the AUT's turn opens it.
        const open = promptOnly ? turns.at(-1)! : openTurn();
        open.turn = turn;
        promptOnly = false;
        return;
      }
      case 'turn-completed': {
        const open = turns.at(-1);
        if (!open) return;
        open.turn ??= num(event.turn);
        open.latencyMs = num(event.latencyMs);
        open.usage = usage(event.usage);
        return;
      }
      case 'message': {
        promptOnly = false;
        const role = str(event.role) ?? 'unknown';
        if (role === 'user') {
          const text =
            typeof event.content === 'string' ? event.content : undefined;
          const prompt = turns
            .at(-1)
            ?.items.find((item) => item.type === 'user');
          // The AUT echoing the prompt the runner already recorded.
          if (
            text !== undefined &&
            prompt?.type === 'user' &&
            prompt.text === text
          )
            return;
          current().push({
            type: 'user',
            at,
            text: text ?? JSON.stringify(event.content),
          });
          return;
        }
        if (role === 'assistant') {
          lastReply = event.content;
          current().push({ type: 'assistant', at, content: event.content });
          return;
        }
        current().push({ type: 'message', at, role, content: event.content });
        return;
      }
      case 'tool-call': {
        promptOnly = false;
        const id = str(event.id) ?? `call-${index}`;
        const item = {
          type: 'tool' as const,
          at,
          id,
          name: str(event.name) ?? 'tool',
          arguments: event.arguments,
        };
        tools.set(id, item);
        current().push(item);
        return;
      }
      case 'tool-result': {
        const call = tools.get(str(event.id) ?? '');
        if (call && !call.result) {
          call.result = { value: event.result, durationMs: at - call.at };
          return;
        }
        // A result without a call: show it as its own tool row.
        current().push({
          type: 'tool',
          at,
          id: str(event.id) ?? `result-${index}`,
          name: str(event.name) ?? 'tool',
          result: { value: event.result, durationMs: 0 },
        });
        return;
      }
      case 'checkpoint-started': {
        const step = num(event.step) ?? index;
        const item = {
          type: 'checkpoint' as const,
          at,
          step,
          name: str(event.name) ?? `step ${step + 1}`,
          state: 'running' as CheckpointState,
        };
        checkpoints.set(step, item);
        current().push(item);
        return;
      }
      case 'checkpoint-completed':
      case 'checkpoint-error': {
        const step = num(event.step) ?? -1;
        const item = checkpoints.get(step);
        if (!item) return;
        item.durationMs = at - item.at;
        if (event.kind === 'checkpoint-error') {
          item.state = 'error';
          item.error = eventError(event.error);
        } else {
          const status = str(event.status);
          item.state =
            status === 'passed' || status === 'failed' || status === 'skipped'
              ? status
              : 'error';
        }
        return;
      }
      case 'transcript-step-skipped':
        current().push({
          type: 'skipped-step',
          at,
          step: num(event.step) ?? -1,
        });
        return;
      case 'scorer-started':
        scorerStarts.set(str(event.scorer) ?? 'scorer', at);
        return;
      case 'scorer-completed':
      case 'scorer-failed': {
        const name = str(event.scorer) ?? 'scorer';
        const started = scorerStarts.get(name);
        scorers.set(name, {
          name,
          value: num(event.value),
          skipped: event.skipped === true,
          error:
            event.kind === 'scorer-failed'
              ? eventError(event.error)
              : undefined,
          durationMs: started === undefined ? undefined : at - started,
        });
        return;
      }
      case 'completed': {
        if (event.output === undefined) return;
        if (JSON.stringify(event.output) === JSON.stringify(lastReply)) return;
        current().push({ type: 'output', at, output: event.output });
        return;
      }
      case 'error':
        current().push({
          type: 'error',
          at,
          source: event.source,
          error: eventError(event.error),
        });
        return;
      default:
        current().push({ type: 'unknown', at, event });
    }
  });

  const last = events.length ? offset(events.length - 1) : undefined;
  return {
    preamble,
    turns,
    scorers: [...scorers.values()],
    durationMs: last,
  };
}

/** `12ms`, `1.4s`, `2m 03s`. */
export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** `1,204 tokens (900 in · 304 out)`. */
export function formatUsage(usage: TurnUsage): string {
  const total =
    usage.totalTokens ??
    (usage.inputTokens !== undefined || usage.outputTokens !== undefined
      ? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
      : undefined);
  const parts = [
    usage.inputTokens === undefined
      ? undefined
      : `${usage.inputTokens.toLocaleString()} in`,
    usage.outputTokens === undefined
      ? undefined
      : `${usage.outputTokens.toLocaleString()} out`,
  ].filter(Boolean);
  const head = total === undefined ? '' : `${total.toLocaleString()} tokens`;
  return parts.length
    ? `${head}${head ? ' ' : ''}(${parts.join(' · ')})`
    : head;
}
