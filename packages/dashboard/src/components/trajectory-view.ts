import type {
  AssistantMessage,
  EntryRecord,
  RunEvent,
  Transcript,
  TreeRecord,
  Usage,
} from '@evalkit/core';
import {
  activePath,
  contentText,
  modelName,
  toolResultValue,
} from '@evalkit/core/transcript';
import { addUsage, cachedTokens, uncachedTokens } from '@evalkit/core/usage';

/** Milliseconds since the transcript's first record or event. */
type Offset = number;

export type EventError = { name?: string; message: string; stack?: string };

export type CheckpointState =
  'running' | 'passed' | 'failed' | 'skipped' | 'error';

/** One thing worth reading in a transcript; bookkeeping is folded away. */
export type TrajectoryItem =
  | { type: 'user'; at: Offset; text: string; scripted: boolean }
  | {
      type: 'assistant';
      at: Offset;
      text: string;
      model?: string;
      error?: string;
    }
  /** The model's reasoning before a reply; folded. */
  | { type: 'reasoning'; at: Offset; text: string; redacted: boolean }
  /** System messages, and tool results with no call. */
  | { type: 'message'; at: Offset; role: string; content: string }
  | {
      type: 'tool';
      at: Offset;
      id: string;
      name: string;
      arguments?: unknown;
      /** Absent while the call has no recorded result. */
      result?: { value: unknown; durationMs: number; isError: boolean };
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
  | { type: 'error'; at: Offset; error: EventError }
  | { type: 'limit'; at: Offset; limit: string; value: number; used: number }
  | {
      type: 'compaction';
      at: Offset;
      summary?: string;
      tokensBefore?: number;
    }
  | { type: 'branch'; at: Offset; summary: string }
  /** A sub-agent: its transcript, nested, when the run kept it. */
  | {
      type: 'subagent';
      at: Offset;
      transcriptId: string;
      relation: string;
      name?: string;
      content?: string;
      view?: TrajectoryView;
    }
  /** A record this dashboard does not show on its own; shown as-is. */
  | { type: 'unknown'; at: Offset; label: string; record: unknown };

/** From one user message up to the next. */
export type TrajectoryTurn = {
  /** First record to last, in this turn. */
  latencyMs?: number;
  usage?: Usage;
  /** Assistant messages: model calls. */
  steps: number;
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
  /** Records before the first user message. */
  preamble: TrajectoryItem[];
  turns: TrajectoryTurn[];
  scorers: ScorerRun[];
  /** First record or event to the last. */
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

/** Run events that the view shows in other ways. */
const FOLDED = new Set([
  'run-started',
  'run-completed',
  'transcript-step-started',
  'transcript-step-completed',
]);

/** Records that only keep books: shown in All records, not the conversation. */
const QUIET = new Set([
  'turn',
  'usage',
  'tool_status',
  'settings',
  'context',
  'context_edit',
]);

type Entry =
  { kind: 'record'; record: TreeRecord } | { kind: 'event'; event: RunEvent };

/**
 * The transcript's active path with EvalKit's events placed in it by `at`:
 * after the record they name, or before every record when `at` is null. An
 * event placed on an abandoned branch follows the last record on the path
 * written before it.
 */
export function placeEvents(
  transcript: Transcript | null,
  events: readonly RunEvent[],
): Entry[] {
  const records = transcript?.records ?? [];
  const path = transcript ? activePath(transcript) : [];
  const onPath = new Set(path.map((record) => record.id));
  const order = new Map(records.map((record, index) => [record.id, index]));
  // Each record's nearest record on the path, at or before it in the file.
  const anchor = new Map<string, string | null>();
  let last: string | null = null;
  for (const record of records) {
    if (onPath.has(record.id)) last = record.id;
    anchor.set(record.id, last);
  }
  const after = new Map<string | null, RunEvent[]>();
  for (const event of events) {
    const at =
      event.at === null || !order.has(event.at)
        ? event.at === null
          ? null
          : (path.at(-1)?.id ?? null)
        : (anchor.get(event.at) ?? null);
    after.set(at, [...(after.get(at) ?? []), event]);
  }
  const entries: Entry[] = [];
  const pushEvents = (id: string | null) => {
    for (const event of after.get(id) ?? [])
      entries.push({ kind: 'event', event });
  };
  pushEvents(null);
  for (const record of path) {
    entries.push({ kind: 'record', record });
    pushEvents(record.id);
  }
  return entries;
}

/**
 * Turns a run's transcript and events into what a reader wants: the
 * conversation, tool calls paired with their results, reasoning folded,
 * sub-agents nested, and checkpoints and limits where they happened.
 */
export function trajectoryView(
  transcript: Transcript | null,
  events: readonly RunEvent[] = [],
  subagents: Readonly<Record<string, Transcript>> = {},
  seen: ReadonlySet<string> = new Set(),
): TrajectoryView {
  const entries = placeEvents(transcript, events);
  const times = [
    ...(transcript?.records.map((record) => Date.parse(record.time)) ?? []),
    ...events.map((event) => Date.parse(event.timestamp)),
  ].filter((time) => !Number.isNaN(time));
  const start = times.length ? Math.min(...times) : 0;
  const offset = (time: string) => {
    const parsed = Date.parse(time);
    return Number.isNaN(parsed) ? 0 : Math.max(0, parsed - start);
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
  let turnStart: Offset | undefined;
  const current = () => turns.at(-1)?.items ?? preamble;
  const touch = (at: Offset) => {
    const turn = turns.at(-1);
    if (turn && turnStart !== undefined)
      turn.latencyMs = Math.max(turn.latencyMs ?? 0, at - turnStart);
  };

  const onRecord = (record: TreeRecord) => {
    const at = offset(record.time);
    if (record.type === 'message') {
      if (record.role === 'user') {
        turns.push({ steps: 0, items: [] });
        turnStart = at;
        current().push({
          type: 'user',
          at,
          text: contentText(record.content),
          scripted:
            record.origin?.kind === 'synthetic' &&
            record.origin.name === 'evalkit',
        });
        return;
      }
      touch(at);
      if (record.role === 'assistant') {
        onAssistant(record as AssistantMessage, at);
        return;
      }
      if (record.role === 'tool') {
        const call = tools.get(record.toolCallId);
        const value = toolResultValue(record);
        if (call && !call.result) {
          call.result = {
            value,
            durationMs: at - call.at,
            isError: record.isError === true,
          };
          return;
        }
        // A result without a call: its own tool row.
        current().push({
          type: 'tool',
          at,
          id: record.toolCallId,
          name: record.toolName ?? 'tool',
          result: { value, durationMs: 0, isError: record.isError === true },
        });
        return;
      }
      current().push({
        type: 'message',
        at,
        role: record.role,
        content: contentText(record.content),
      });
      return;
    }
    touch(at);
    switch (record.type) {
      case 'compaction':
        current().push({
          type: 'compaction',
          at,
          ...(record.summary ? { summary: record.summary } : {}),
          ...(record.tokensBefore === undefined
            ? {}
            : { tokensBefore: record.tokensBefore }),
        });
        return;
      case 'branch_summary':
        current().push({ type: 'branch', at, summary: record.summary });
        return;
      case 'agent_link': {
        const nested = subagents[record.transcriptId];
        current().push({
          type: 'subagent',
          at,
          transcriptId: record.transcriptId,
          relation: record.relation,
          ...(record.agent?.name ? { name: record.agent.name } : {}),
          ...(record.content ? { content: contentText(record.content) } : {}),
          // A transcript that links back to one already shown is not nested again.
          ...(nested && !seen.has(record.transcriptId)
            ? {
                view: trajectoryView(
                  nested,
                  [],
                  subagents,
                  new Set([...seen, record.transcriptId]),
                ),
              }
            : {}),
        });
        return;
      }
      default:
        if (record.type === 'usage' && !record.cumulative) {
          const turn = turns.at(-1);
          if (turn) turn.usage = addUsage(turn.usage, record.usage);
        }
        if (QUIET.has(record.type)) return;
        current().push({
          type: 'unknown',
          at,
          label:
            record.type === 'custom'
              ? `${record.namespace} · ${record.name}`
              : record.type,
          record,
        });
    }
  };

  const onAssistant = (record: AssistantMessage, at: Offset) => {
    const turn = turns.at(-1);
    if (turn) {
      turn.steps += 1;
      turn.usage = addUsage(turn.usage, record.usage);
    }
    for (const block of record.content)
      if (block.type === 'reasoning') {
        const text = block.text ?? block.summary?.join('\n') ?? '';
        if (text || block.redacted)
          current().push({
            type: 'reasoning',
            at,
            text,
            redacted: block.redacted === true,
          });
      }
    const text = contentText(record.content);
    if (text || record.error)
      current().push({
        type: 'assistant',
        at,
        text,
        ...(record.model ? { model: modelName(record.model)! } : {}),
        ...(record.error ? { error: record.error.message } : {}),
      });
    for (const block of record.content)
      if (block.type === 'tool_call') {
        const item = {
          type: 'tool' as const,
          at,
          id: block.id,
          name: block.name,
          arguments: block.arguments ?? block.input,
        };
        tools.set(block.id, item);
        current().push(item);
      }
  };

  const onEvent = (event: RunEvent) => {
    if (FOLDED.has(event.kind)) return;
    const at = offset(event.timestamp);
    switch (event.kind) {
      case 'checkpoint-started': {
        const item = {
          type: 'checkpoint' as const,
          at,
          step: event.step,
          name: event.name,
          state: 'running' as CheckpointState,
        };
        checkpoints.set(event.step, item);
        current().push(item);
        return;
      }
      case 'checkpoint-completed':
      case 'checkpoint-error': {
        const item = checkpoints.get(event.step);
        if (!item) return;
        item.durationMs = at - item.at;
        if (event.kind === 'checkpoint-error') {
          item.state = 'error';
          item.error = eventError(event.error);
        } else
          item.state =
            event.status === 'passed' ||
            event.status === 'failed' ||
            event.status === 'skipped'
              ? event.status
              : 'error';
        return;
      }
      case 'transcript-step-skipped':
        current().push({ type: 'skipped-step', at, step: event.step });
        return;
      case 'limit-reached':
        current().push({
          type: 'limit',
          at,
          limit: event.limit,
          value: event.value,
          used: event.used,
        });
        return;
      case 'scorer-started':
        scorerStarts.set(event.scorer, at);
        return;
      case 'scorer-completed':
      case 'scorer-failed': {
        const started = scorerStarts.get(event.scorer);
        scorers.set(event.scorer, {
          name: event.scorer,
          value:
            event.kind === 'scorer-completed' ? num(event.value) : undefined,
          skipped: event.kind === 'scorer-completed' && event.skipped === true,
          ...(event.kind === 'scorer-failed'
            ? { error: eventError(event.error) }
            : {}),
          ...(started === undefined ? {} : { durationMs: at - started }),
        });
        return;
      }
      case 'error':
        current().push({ type: 'error', at, error: eventError(event.error) });
        return;
    }
  };

  for (const entry of entries)
    if (entry.kind === 'record') onRecord(entry.record);
    else onEvent(entry.event);

  return {
    preamble,
    turns,
    scorers: [...scorers.values()],
    ...(times.length ? { durationMs: Math.max(...times) - start } : {}),
  };
}

/** Every line of a transcript, as All records lists them. */
export function rawRecords(transcript: Transcript | null): EntryRecord[] {
  return transcript?.records ?? [];
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

/** `1,204 tokens (900 in · 304 out · 8,000 cached)`; cache reads are not tokens. */
export function formatUsage(usage: Usage): string {
  const parts = [
    usage.input || usage.cacheWrite
      ? `${(usage.input + (usage.cacheWrite ?? 0)).toLocaleString()} in`
      : undefined,
    usage.output ? `${usage.output.toLocaleString()} out` : undefined,
    cachedTokens(usage)
      ? `${cachedTokens(usage).toLocaleString()} cached`
      : undefined,
  ].filter(Boolean);
  const head = `${uncachedTokens(usage).toLocaleString()} tokens`;
  return parts.length ? `${head} (${parts.join(' · ')})` : head;
}
