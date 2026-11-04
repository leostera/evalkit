import type {
  AssistantBlock,
  EntryRecord,
  MessageRecord,
  ModelRef,
  ToolCallBlock,
  Transcript,
  TreeRecord,
  UserContent,
} from '@leostera/atxf';

// No runtime import from @leostera/atxf here: the dashboard bundles this file.

export type {
  AssistantBlock,
  EntryRecord,
  MessageRecord,
  ModelRef,
  ToolCallBlock,
  Transcript,
  TranscriptHeader,
  TreeRecord,
  UserBlock,
  UserContent,
} from '@leostera/atxf';

/** The ATXF version EvalKit writes. */
export const ATXF_VERSION = '0.1';

const TREE = new Set([
  'message',
  'context',
  'settings',
  'compaction',
  'context_edit',
  'branch_summary',
  'turn',
  'tool_status',
  'usage',
  'checkpoint',
  'agent_link',
  'custom',
]);

export function isTreeRecord(record: EntryRecord): record is TreeRecord {
  return TREE.has(record.type);
}

export type AssistantMessage = MessageRecord & { role: 'assistant' };
export type ToolMessage = MessageRecord & { role: 'tool' };

/**
 * The records from the transcript's root to its active leaf, in order: what
 * the session is now, without abandoned branches (ATXF §4).
 */
export function activePath(transcript: Transcript): TreeRecord[] {
  const byId = new Map<string, TreeRecord>();
  let leaf: string | null = null;
  for (const record of transcript.records) {
    if (isTreeRecord(record)) {
      byId.set(record.id, record);
      leaf = record.id;
    } else if (record.type === 'leaf') leaf = record.targetId;
  }
  const path: TreeRecord[] = [];
  const seen = new Set<string>();
  for (let id = leaf; id !== null && !seen.has(id);) {
    seen.add(id);
    const record = byId.get(id);
    if (!record) break;
    path.push(record);
    id = record.parentId;
  }
  return path.reverse();
}

/** Messages on the active path, optionally of one role. */
export function transcriptMessages(
  transcript: Transcript,
  role?: MessageRecord['role'],
): MessageRecord[] {
  return activePath(transcript).filter(
    (record): record is MessageRecord =>
      record.type === 'message' && (role === undefined || record.role === role),
  );
}

/** A tool call and, when the transcript has it, its result. */
export type PairedToolCall = {
  /** The assistant message holding the call. */
  message: AssistantMessage;
  call: ToolCallBlock;
  result?: ToolMessage;
};

/** A tool call as scorers see it: its name, arguments and what it returned. */
export type ToolCall = {
  id: string;
  name: string;
  /** Its arguments; `{}` when the agent recorded raw `input` instead. */
  arguments: Record<string, unknown>;
  /** Raw input for tools that take text rather than JSON arguments. */
  input?: string;
  /** What the tool returned (JSON the adapter recorded, else the result's text); undefined before a result. */
  result?: unknown;
  /** The tool reported an error. */
  isError: boolean;
  /** The assistant message holding the call. */
  messageId: string;
  /** The tool result message, when there is one. */
  resultId?: string;
};

/** Every tool call on the active path, in order, with its result. */
export function transcriptToolCalls(
  transcript: Transcript,
  name?: string,
): ToolCall[] {
  return callsIn(activePath(transcript))
    .filter((entry) => name === undefined || entry.call.name === name)
    .map(({ message, call, result }) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments ?? {},
      ...(call.input !== undefined ? { input: call.input } : {}),
      ...(result
        ? { result: toolResultValue(result), resultId: result.id }
        : {}),
      isError: result?.isError === true,
      messageId: message.id,
    }));
}

/** Tool calls among `records`, each paired with the first result for it. */
export function callsIn(records: readonly TreeRecord[]): PairedToolCall[] {
  const calls: PairedToolCall[] = [];
  const open = new Map<string, PairedToolCall>();
  for (const record of records) {
    if (record.type !== 'message') continue;
    if (record.role === 'assistant')
      for (const block of record.content)
        if (block.type === 'tool_call') {
          const entry = { message: record as AssistantMessage, call: block };
          calls.push(entry);
          open.set(block.id, entry);
        }
    if (record.role === 'tool') {
      const entry = open.get(record.toolCallId);
      if (entry && !entry.result) entry.result = record as ToolMessage;
    }
  }
  return calls;
}

/** The text of a message's content: text blocks joined, other blocks left out. */
export function contentText(content: UserContent | AssistantBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n');
}

/** The text of the last assistant message on the active path, or `''`. */
export function transcriptReply(transcript: Transcript): string {
  const last = transcriptMessages(transcript, 'assistant').at(-1);
  return last ? contentText(last.content) : '';
}

/**
 * A tool result's value: the JSON an adapter returned (kept in
 * `details.result`), else the result's text.
 */
export function toolResultValue(result: ToolMessage): unknown {
  if (result.details && 'result' in result.details)
    return result.details.result;
  return contentText(result.content);
}

/** `provider/id`, or `id` when the provider is unknown. */
export function modelName(model: ModelRef | undefined): string | undefined {
  if (!model) return undefined;
  return model.provider === 'unknown'
    ? model.id
    : `${model.provider}/${model.id}`;
}

/** `openai/gpt-5` → `{ provider: 'openai', id: 'gpt-5' }`; without a provider, `unknown`. */
export function parseModel(model: string | ModelRef): ModelRef {
  if (typeof model !== 'string') return model;
  const slash = model.indexOf('/');
  return slash > 0 && slash < model.length - 1
    ? { provider: model.slice(0, slash), id: model.slice(slash + 1) }
    : { provider: 'unknown', id: model };
}

/** The transcript, empty: what scorers see before the agent recorded anything. */
export function emptyTranscript(header: Transcript['header']): Transcript {
  return { header, records: [] };
}
