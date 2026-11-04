import type {
  AssistantBlock,
  ModelRef,
  Origin,
  StopReason,
  Transcript,
  TreeRecord,
  UserBlock,
} from '@leostera/atxf';
import type { UsageInput } from './usage.js';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** An ATXF tree record to append: `id`, `time` and `parentId` are filled in when absent. */
export type RecordInput = DistributiveOmit<
  TreeRecord,
  'id' | 'time' | 'parentId' | 'hash'
> & { id?: string; time?: string; parentId?: string | null };

/** An assistant message: what the model said and the tools it called. */
export type AssistantInput = {
  /** Text, or ATXF blocks: `text`, `reasoning`, `tool_call` and `image`. */
  content: string | AssistantBlock[];
  /** `provider/id` (`openai/gpt-5`), or an ATXF model reference. */
  model?: string | ModelRef;
  /** This response's usage, in ATXF's buckets. */
  usage?: UsageInput;
  stop?: StopReason;
  error?: { message: string; code?: string };
};

/**
 * Where an adapter records what its agent did, as an ATXF transcript
 * (https://atxf.leostera.dev). Each method appends one record and returns
 * its ID. EvalKit writes each scripted user message itself, unless the
 * adapter writes it (or imports a transcript holding it) first.
 */
export type TranscriptWriter = {
  /** A message the agent received. */
  user(content: string | UserBlock[], options?: { origin?: Origin }): string;
  assistant(message: AssistantInput): string;
  /**
   * A tool call's result. A string is the result's text; any other
   * JSON-convertible value is kept as is in `details.result` and shown as
   * JSON.
   */
  toolResult(
    callId: string,
    result: unknown,
    options?: { name?: string; isError?: boolean },
  ): string;
  /** Any other ATXF tree record, such as `reasoning` settings, a compaction or a sub-agent link. */
  append(record: RecordInput): string;
  /**
   * Appends an ATXF transcript's records that were not imported before (by
   * ID), keeping their IDs and native records: for agents whose sessions
   * ATXF converts (`pi.toAtxf(await readFile(sessionFile, 'utf8'))`, from `@leostera/atxf/pi`). Import the whole session
   * after each turn; a user message matching the one EvalKit is about to
   * write stands for it.
   */
  import(transcript: Transcript): void;
  /**
   * Marks a turn's start or end, as the agent saw it: `turn('start')`
   * returns a turn ID to pass to `turn('end', { turnId, outcome })`.
   */
  turn(
    phase: 'start' | 'end',
    options?: {
      turnId?: string;
      outcome?: 'succeeded' | 'failed' | 'interrupted';
      error?: { message: string; code?: string };
    },
  ): string;
  /**
   * Keeps a sub-agent's ATXF transcript with the run, in
   * `transcripts/<id>.atxf.jsonl`, linked from this one by an `agent_link`
   * record with its `transcriptId` (append one, or import a session that
   * has it). Its steps and tokens count toward the run's limits. Pass the
   * whole transcript again as it grows; it replaces the one kept.
   */
  subagent(transcript: Transcript): void;
};

export type TurnToolCall = {
  name: string;
  arguments?: unknown;
  /** When given, the call's result is recorded after it. */
  result?: unknown;
  id?: string;
};

/** What `send()` may return instead of writing to the transcript. A string is the reply. */
export type TurnResult =
  | string
  | {
      /** Text, or a JSON value (recorded as its JSON text). */
      reply?: unknown;
      toolCalls?: readonly TurnToolCall[];
      usage?: UsageInput;
      /** The model that answered. */
      model?: string | ModelRef;
    };
