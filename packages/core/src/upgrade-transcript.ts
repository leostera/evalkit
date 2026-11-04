/**
 * Converts a run saved by EvalKit before 0.11 (report schema version 6) to
 * version 7 (RFD0009): its `trajectory.jsonl` becomes an ATXF transcript
 * plus EvalKit's run events, and its scoring points into the transcript.
 * Pure and dependency-free (types only), so the share server's Worker can
 * bundle it; `evalkit upgrade` adds integrity hashes afterwards.
 */
import type {
  AssistantBlock,
  EntryRecord,
  MessageRecord,
  ModelRef,
  Native,
  Transcript,
  TreeRecord,
  Usage,
} from '@leostera/atxf';
import { reportedUsages, uncachedTokens, usageMetrics } from './usage.js';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type Verdict = JsonRecord & {
  judge?: Json;
  matchedToolCall?: Json;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonRecord = { [key: string]: Json };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `source.format` of a transcript converted from a version 6 trajectory. */
export const V6_TRAJECTORY_FORMAT = 'evalkit-trajectory-v6';

/** A converted run: the agent's transcript and EvalKit's events, placed in it. */
export type ConvertedTrajectory = {
  transcript: Transcript;
  runEvents: Array<JsonRecord & { at: string | null }>;
  /** For each old event index, the record it became part of. */
  recordOfEvent: Map<number, string>;
};

/** Old usage: input counted cached tokens, which were reported as a subset. */
export function upgradeUsage(value: unknown): Usage | undefined {
  if (!isRecord(value)) return undefined;
  const num = (key: string) =>
    typeof value[key] === 'number' ? (value[key] as number) : undefined;
  const input = num('inputTokens');
  const output = num('outputTokens');
  const cached = num('cachedInputTokens');
  const total = num('totalTokens');
  if (input === undefined && output === undefined) {
    if (total === undefined) return undefined;
    return { input: 0, output: 0, total };
  }
  const cacheRead = Math.min(cached ?? 0, input ?? 0);
  return {
    input: (input ?? 0) - cacheRead,
    output: output ?? 0,
    ...(cacheRead ? { cacheRead } : {}),
    ...(total === undefined ? {} : { total }),
  };
}

/** Old usage's `tokens`, as 0.10 counted it: input (cached included) plus output, or the total. */
export function oldTokens(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  const input = value.inputTokens;
  const output = value.outputTokens;
  if (typeof input === 'number' || typeof output === 'number')
    return (
      (typeof input === 'number' ? input : 0) +
      (typeof output === 'number' ? output : 0)
    );
  return typeof value.totalTokens === 'number' ? value.totalTokens : undefined;
}

function parseModel(model: unknown): ModelRef | undefined {
  if (typeof model !== 'string' || !model) return undefined;
  const slash = model.indexOf('/');
  return slash > 0 && slash < model.length - 1
    ? { provider: model.slice(0, slash), id: model.slice(slash + 1) }
    : { provider: 'unknown', id: model };
}

const text = (value: Json | undefined): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? null);

/**
 * Splits a version 6 trajectory (its events, parsed) into an ATXF
 * transcript of the agent's events and EvalKit's events placed in it.
 * Every record carries the old events it came from in `native`.
 */
export function convertTrajectory(
  events: readonly unknown[],
  run: {
    runId: string;
    evalId?: string;
    startedAt: string;
    agent?: { id?: string; version?: string };
  },
): ConvertedTrajectory {
  const records: TreeRecord[] = [];
  const runEvents: ConvertedTrajectory['runEvents'] = [];
  const recordOfEvent = new Map<number, string>();
  let lastId: string | null = null;
  let next = 0;
  let sawUsage = false;
  let sawTurns = false;
  /** The assistant message the next tool call joins, while nothing came after it. */
  let joinable: (MessageRecord & { role: 'assistant' }) | undefined;
  let openTurn: { turnId: string; from: number } | undefined;
  /**
   * 0.10 recorded EvalKit's prompt only on its step event; it becomes the
   * user message, unless the adapter recorded the same message itself.
   */
  let prompt:
    | { content: string; time: string; index: number; event: unknown }
    | undefined;

  const native = (...old: unknown[]): Native => ({
    source: 'evalkit',
    format: V6_TRAJECTORY_FORMAT,
    records: old,
  });
  const push = <R extends TreeRecord = TreeRecord>(
    record: DistributiveOmit<TreeRecord, 'id' | 'parentId'>,
    index: number,
  ): R => {
    const full = {
      ...record,
      id: `r${++next}`,
      parentId: lastId,
    } as unknown as R;
    records.push(full);
    lastId = full.id;
    recordOfEvent.set(index, full.id);
    joinable = undefined;
    return full;
  };

  const flushPrompt = () => {
    if (!prompt) return;
    const { content, time, index, event } = prompt;
    prompt = undefined;
    push(
      { type: 'message', time, role: 'user', content, native: native(event) },
      index,
    );
  };

  events.forEach((event, index) => {
    if (!isRecord(event)) return;
    const time =
      typeof event.timestamp === 'string' ? event.timestamp : run.startedAt;
    if (event.source !== 'aut') {
      const { source: _, ...rest } = event;
      if (event.kind !== 'transcript-step-started') flushPrompt();
      runEvents.push({ ...rest, at: lastId });
      if (
        event.kind === 'transcript-step-started' &&
        typeof event.message === 'string'
      )
        prompt = { content: event.message, time, index, event };
      return;
    }
    if (
      prompt &&
      event.kind === 'message' &&
      event.role === 'user' &&
      event.content === prompt.content
    )
      prompt = undefined;
    else flushPrompt();
    switch (event.kind) {
      case 'message': {
        const role = event.role;
        const content = event.content;
        const extra = typeof content === 'string' ? {} : { content };
        const ext = Object.keys(extra).length
          ? { ext: { evalkit: extra } }
          : {};
        if (role === 'assistant') {
          const message = push<MessageRecord & { role: 'assistant' }>(
            {
              type: 'message',
              time,
              role: 'assistant',
              content: [{ type: 'text', text: text(content) }],
              native: native(event),
              ...ext,
            },
            index,
          );
          joinable = message;
        } else if (role === 'tool')
          push(
            {
              type: 'message',
              time,
              role: 'tool',
              toolCallId: `unknown-${index}`,
              content: text(content),
              native: native(event),
              ...ext,
            },
            index,
          );
        else
          push(
            {
              type: 'message',
              time,
              role: role === 'system' ? 'system' : 'user',
              content: text(content),
              native: native(event),
              ...ext,
            },
            index,
          );
        return;
      }
      case 'tool-call': {
        const block: AssistantBlock = {
          type: 'tool_call',
          id: String(event.id ?? `call-${index}`),
          name: String(event.name ?? 'tool'),
          kind: 'function',
          arguments: isRecord(event.arguments)
            ? (event.arguments as Record<string, unknown>)
            : { value: event.arguments ?? null },
        };
        if (joinable) {
          joinable.content.push(block);
          joinable.native!.records.push(event);
          recordOfEvent.set(index, joinable.id);
          return;
        }
        const message = push<MessageRecord & { role: 'assistant' }>(
          {
            type: 'message',
            time,
            role: 'assistant',
            content: [block],
            native: native(event),
          },
          index,
        );
        joinable = message;
        return;
      }
      case 'tool-result': {
        const result = event.result ?? null;
        push(
          {
            type: 'message',
            time,
            role: 'tool',
            toolCallId: String(event.id ?? `call-${index}`),
            ...(typeof event.name === 'string' ? { toolName: event.name } : {}),
            content: text(result),
            ...(typeof result === 'string' ? {} : { details: { result } }),
            native: native(event),
          },
          index,
        );
        return;
      }
      case 'turn-started': {
        sawTurns = true;
        const turnId = `turn-${String(event.turn ?? index)}`;
        push(
          {
            type: 'turn',
            time,
            phase: 'start',
            turnId,
            native: native(event),
          },
          index,
        );
        openTurn = { turnId, from: records.length };
        return;
      }
      case 'turn-completed': {
        const usage = upgradeUsage(event.usage);
        const model = parseModel(event.model);
        const from = openTurn?.from ?? 0;
        let holder: (MessageRecord & { role: 'assistant' }) | undefined;
        for (let at = records.length - 1; at >= from; at -= 1) {
          const record = records[at]!;
          if (record.type === 'message' && record.role === 'assistant') {
            holder = record as MessageRecord & { role: 'assistant' };
            break;
          }
        }
        if (usage) sawUsage = true;
        const totalOnly =
          usage && usage.input === 0 && usage.output === 0 && !usage.cacheRead;
        if (holder && !(usage && holder.usage)) {
          if (usage) holder.usage = usage;
          if (model) holder.model = model;
          if (totalOnly)
            holder.ext = {
              ...holder.ext,
              evalkit: { ...(holder.ext?.evalkit as object), totalOnly: true },
            };
        } else if (usage)
          push(
            {
              type: 'usage',
              time,
              kind: 'turn',
              usage,
              ...(model ? { model } : {}),
              ...(totalOnly ? { ext: { evalkit: { totalOnly: true } } } : {}),
            },
            index,
          );
        const latency =
          typeof event.latencyMs === 'number'
            ? { ext: { evalkit: { latencyMs: event.latencyMs } } }
            : {};
        if (openTurn) {
          push(
            {
              type: 'turn',
              time,
              phase: 'end',
              turnId: openTurn.turnId,
              outcome: 'succeeded',
              native: native(event),
              ...latency,
            },
            index,
          );
          openTurn = undefined;
        } else if (holder) {
          holder.native!.records.push(event);
          recordOfEvent.set(index, holder.id);
        } else
          push(
            {
              type: 'custom',
              time,
              namespace: 'evalkit',
              name: 'turn-completed',
              data: event,
              native: native(event),
            },
            index,
          );
        return;
      }
      default: {
        // started, completed and error: kept as EvalKit records, never dropped.
        const { source: _, kind, timestamp: __, ...data } = event;
        push(
          {
            type: 'custom',
            time,
            namespace: 'evalkit',
            name: String(kind),
            ...(Object.keys(data).length ? { data } : {}),
            native: native(event),
          },
          index,
        );
      }
    }
  });
  flushPrompt();

  const firstTime = records[0]?.time ?? run.startedAt;
  const transcript: Transcript = {
    header: {
      type: 'transcript',
      atxf: '0.1',
      id: run.runId,
      time: firstTime,
      source: {
        agent: run.agent?.id ?? 'unknown',
        ...(run.agent?.version ? { version: run.agent.version } : {}),
        format: V6_TRAJECTORY_FORMAT,
      },
      fidelity: {
        topology: 'linear',
        instructions: 'none',
        tools: 'none',
        reasoning: 'none',
        toolLifecycle: false,
        turns: sawTurns,
        usage: sawUsage ? 'per-response' : 'none',
        native: 'all',
        ids: 'synthetic',
      },
      ext: {
        evalkit: {
          runId: run.runId,
          ...(run.evalId ? { scenarioId: run.evalId } : {}),
        },
      },
    },
    records: records as EntryRecord[],
  };
  return { transcript, runEvents, recordOfEvent };
}

/**
 * A version 6 `scoring.json` for version 7: each judge's events become its
 * transcript and its usage moves to ATXF's buckets, each checkpoint's
 * matched tool call points at the record holding it, the token metrics
 * are recomputed from the converted transcript, and `steps` is added.
 * Throws when the recomputed tokens (uncached plus cached)
 * do not add up to the saved ones, so a run is never converted wrongly.
 */
export function upgradeScoring(
  scoring: unknown,
  run: { runId: string; startedAt: string },
  recordOfEvent: ReadonlyMap<number, string>,
  agent: Transcript,
): JsonRecord {
  if (!isRecord(scoring)) throw new Error('scoring.json is not an object');
  const judgeUsage: Usage[] = [];
  const verdict = (entry: Json, index: number): Json => {
    if (!isRecord(entry)) return entry;
    const result: Verdict = { ...entry };
    if (isRecord(result.matchedToolCall)) {
      const { eventIndex, id } = result.matchedToolCall;
      const messageId =
        typeof eventIndex === 'number'
          ? recordOfEvent.get(eventIndex)
          : undefined;
      if (messageId && typeof id === 'string')
        result.matchedToolCall = { messageId, id };
      else delete result.matchedToolCall;
    }
    if (isRecord(result.judge)) {
      const { events, usage, ...judge } = result.judge;
      const converted = Array.isArray(events)
        ? convertTrajectory(
            events.map((event) =>
              isRecord(event) ? { ...event, source: 'aut' } : event,
            ),
            {
              runId: `${run.runId}-judge-${index}`,
              startedAt: run.startedAt,
              ...(isRecord(judge.agent) && typeof judge.agent.id === 'string'
                ? { agent: { id: judge.agent.id } }
                : {}),
            },
          ).transcript
        : undefined;
      const atxfUsage = upgradeUsage(usage);
      if (atxfUsage) judgeUsage.push(atxfUsage);
      result.judge = {
        ...judge,
        ...(atxfUsage ? { usage: atxfUsage as unknown as Json } : {}),
        ...(converted ? { transcript: converted as unknown as Json } : {}),
      };
    }
    return result;
  };
  const results = Array.isArray(scoring.results)
    ? scoring.results.map((entry, index) => verdict(entry, index))
    : [];
  const checkpoints = Array.isArray(scoring.checkpoints)
    ? scoring.checkpoints.map((entry, index) =>
        verdict(entry, results.length + index),
      )
    : undefined;
  const metrics = Array.isArray(scoring.metrics)
    ? upgradeMetrics(scoring.metrics, agent, judgeUsage)
    : undefined;
  return {
    ...scoring,
    results,
    ...(checkpoints ? { checkpoints } : {}),
    ...(metrics ? { metrics } : {}),
  };
}

/** Built-in metrics recomputed from the converted transcript. */
const RECOMPUTED_METRICS = new Set([
  'steps',
  'tokens',
  'cached tokens',
  'output tokens',
  'cache hit rate',
  'judge tokens',
]);

function upgradeMetrics(
  metrics: Json[],
  transcript: Transcript,
  judges: readonly Usage[],
): Json[] {
  const agent = reportedUsages(transcript);
  // One step per assistant message, as runs record it since 0.11.
  const steps = transcript.records.filter(
    (record) => record.type === 'message' && record.role === 'assistant',
  ).length;
  const saved = (name: string) => {
    const entry = metrics.find(
      (metric) => isRecord(metric) && metric.name === name,
    );
    return isRecord(entry) && typeof entry.value === 'number'
      ? entry.value
      : undefined;
  };
  const check = (
    name: string,
    before: number | undefined,
    usages: readonly Usage[],
  ) => {
    if (before === undefined) return;
    const after = usages.reduce(
      (sum, usage) => sum + uncachedTokens(usage) + (usage.cacheRead ?? 0),
      0,
    );
    if (after !== before)
      throw new Error(
        `${name} do not add up after converting: ${before} saved, ${after} recomputed`,
      );
  };
  check('tokens', saved('tokens'), agent);
  check('judge tokens', saved('judge tokens'), judges);
  const kept = metrics.filter(
    (metric) =>
      !(isRecord(metric) && RECOMPUTED_METRICS.has(String(metric.name))),
  );
  return [
    ...kept,
    { name: 'steps', value: steps, better: 'lower', builtIn: true },
    ...usageMetrics(agent).map((metric) => metric as unknown as Json),
    ...(judges.length
      ? [
          {
            name: 'judge tokens',
            value: judges.reduce(
              (sum, usage) => sum + uncachedTokens(usage),
              0,
            ),
            unit: 'tokens',
            better: 'lower',
            builtIn: true,
          },
        ]
      : []),
  ];
}
