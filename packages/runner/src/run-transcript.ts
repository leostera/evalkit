import {
  TranscriptHasher,
  addIntegrity,
  serializeTranscript,
  validateTranscript,
} from '@leostera/atxf';
import {
  toJson,
  type AssistantBlock,
  type AssistantInput,
  type EntryRecord,
  type RecordInput,
  type Transcript,
  type TranscriptHeader,
  type TranscriptWriter,
  type TreeRecord,
  type TurnResult,
  type Usage,
} from '@evalkit/core';
import {
  ATXF_VERSION,
  contentText,
  isTreeRecord,
  parseModel,
} from '@evalkit/core/transcript';
import { normalizeUsage } from '@evalkit/core/usage';

/** What a new transcript is about. */
export type TranscriptSource = {
  /** The transcript's ID: the run's, or a judge session's. */
  id: string;
  agent: { id: string; version?: string };
  runId: string;
  scenarioId: string;
  now: () => Date;
  /** Saves each line (the header first). Writes happen in order. */
  persist?: (line: TranscriptHeader | EntryRecord) => Promise<void>;
  /** Observes each record once it is appended. Must not throw. */
  onRecord?: (record: EntryRecord) => void;
  /** Saves a sub-agent's whole transcript, replacing what was saved. */
  persistSubagent?: (id: string, text: string) => Promise<void>;
  /** Observes each sub-agent record the first time it is seen. Must not throw. */
  onSubagentRecord?: (record: EntryRecord) => void;
};

/**
 * One session's ATXF transcript as it is written: every record hashed as
 * it is appended (ATXF §17), saved in order, and sealed at the end. It is
 * the adapter's `TranscriptWriter` and EvalKit's own.
 */
export class RunTranscript {
  readonly header: TranscriptHeader;
  private readonly hasher: TranscriptHasher;
  private readonly entries: EntryRecord[] = [];
  private readonly ids = new Set<string>();
  private readonly imported = new Set<string>();
  private importBase: string | null | undefined;
  private leaf: string | null = null;
  private next = 0;
  private pendingUser: string | undefined;
  private turns = 0;
  private readonly subagentTranscripts = new Map<string, Transcript>();
  private readonly subagentSeen = new Map<string, Set<string>>();
  private sealed = false;
  private writes: Promise<void> = Promise.resolve();
  private writeError: unknown;

  constructor(private readonly source: TranscriptSource) {
    this.hasher = new TranscriptHasher({
      type: 'transcript',
      atxf: ATXF_VERSION,
      id: source.id,
      time: source.now().toISOString(),
      source: {
        agent: source.agent.id,
        ...(source.agent.version ? { version: source.agent.version } : {}),
      },
      fidelity: {
        topology: 'tree',
        reasoning: 'mixed',
        usage: 'per-response',
        native: 'partial',
        ids: 'stable',
      },
      ext: { evalkit: { runId: source.runId, scenarioId: source.scenarioId } },
    });
    this.header = this.hasher.header;
    this.save(this.header);
  }

  /** The transcript so far. */
  get transcript(): Transcript {
    return { header: this.header, records: [...this.entries] };
  }

  /** The ID of the active leaf: where run events are placed. */
  get leafId(): string | null {
    return this.leaf;
  }

  /** Records appended since `from` (a `records.length` taken earlier). */
  since(from: number): EntryRecord[] {
    return this.entries.slice(from);
  }

  get length(): number {
    return this.entries.length;
  }

  /** Resolves once every line is saved; rejects with the first write error. */
  async settled(): Promise<void> {
    await this.writes;
    if (this.writeError) throw this.writeError;
  }

  /**
   * The message EvalKit is about to send. It is written before the adapter's
   * first record of the turn, unless the adapter writes a user message (or
   * imports one with the same text) first, which then stands for it.
   */
  scriptUser(message: string): void {
    this.flushUser();
    this.pendingUser = message;
  }

  /** Writes the scripted message if nothing in the turn stood for it. */
  endTurn(): void {
    this.flushUser();
  }

  /** What `send()` returned, as records: tool calls with results, then the reply. */
  writeTurnResult(result: TurnResult, turn: number): void {
    if (typeof result === 'string') result = { reply: result };
    if (typeof result !== 'object' || result === null)
      throw new Error('send() must return nothing, a string, or a turn result');
    const calls = (result.toolCalls ?? []).map((call, index) => ({
      ...call,
      id: call.id ?? `turn-${turn}-call-${index + 1}`,
    }));
    const extras = {
      ...(result.model === undefined ? {} : { model: result.model }),
      ...(result.usage === undefined ? {} : { usage: result.usage }),
    };
    const hasReply = result.reply !== undefined;
    if (calls.length) {
      this.assistant({
        content: calls.map((call): AssistantBlock => ({
          type: 'tool_call',
          id: call.id,
          name: call.name,
          kind: 'function',
          arguments: toolArguments(call.arguments),
        })),
        ...(hasReply ? {} : extras),
      });
      for (const call of calls)
        if (call.result !== undefined)
          this.toolResult(call.id, call.result, { name: call.name });
    }
    if (hasReply)
      this.assistant({
        content:
          typeof result.reply === 'string'
            ? result.reply
            : JSON.stringify(toJson(result.reply, 'reply')),
        ...extras,
      });
    else if (!calls.length && result.usage) {
      const usage = normalizeUsage(result.usage);
      if (usage)
        this.append({
          type: 'usage',
          kind: 'turn',
          usage,
          ...(result.model === undefined
            ? {}
            : { model: parseModel(result.model) }),
        });
    }
  }

  /** The adapter's writer. */
  writer(): TranscriptWriter {
    return {
      user: (content, options) => {
        this.pendingUser = undefined;
        return this.append({
          type: 'message',
          role: 'user',
          content,
          ...(options?.origin ? { origin: options.origin } : {}),
        });
      },
      assistant: (message) => this.assistant(message),
      toolResult: (callId, result, options) =>
        this.toolResult(callId, result, options),
      append: (record) => this.append(record),
      import: (transcript) => this.importTranscript(transcript),
      turn: (phase, options = {}) => {
        const turnId = options.turnId ?? `turn-${++this.turns}`;
        this.append({
          type: 'turn',
          phase,
          turnId,
          ...(options.outcome ? { outcome: options.outcome } : {}),
          ...(options.error ? { error: options.error } : {}),
        });
        return turnId;
      },
      subagent: (transcript) => this.keepSubagent(transcript),
    };
  }

  /** Sub-agent transcripts kept so far, by transcript ID. */
  get subagents(): Record<string, Transcript> {
    return Object.fromEntries(this.subagentTranscripts);
  }

  private keepSubagent(transcript: Transcript): void {
    if (this.sealed)
      throw new Error('The transcript is sealed: the run has ended');
    const id = transcript?.header?.id;
    if (typeof id !== 'string' || !id || !Array.isArray(transcript.records))
      throw new Error(
        'subagent() takes an ATXF transcript: { header: { id, … }, records: [...] }',
      );
    if (id === this.header.id)
      throw new Error(`A sub-agent cannot have the run's transcript ID ${id}`);
    const seen = this.subagentSeen.get(id) ?? new Set<string>();
    this.subagentSeen.set(id, seen);
    for (const record of transcript.records) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      try {
        this.source.onSubagentRecord?.(record);
      } catch {
        // Counting must never break the agent's run.
      }
    }
    this.subagentTranscripts.set(id, transcript);
    this.saveSubagent(id, transcript);
  }

  private saveSubagent(id: string, transcript: Transcript): void {
    const persist = this.source.persistSubagent;
    if (!persist) return;
    const text = serializeTranscript(transcript);
    this.writes = this.writes.then(() =>
      persist(id, text).catch((error: unknown) => {
        this.writeError ??= error;
      }),
    );
  }

  assistant(message: AssistantInput): string {
    const usage = normalizeUsage(message.usage);
    return this.append({
      type: 'message',
      role: 'assistant',
      content:
        typeof message.content === 'string'
          ? [{ type: 'text', text: message.content }]
          : message.content,
      ...(message.model === undefined
        ? {}
        : { model: parseModel(message.model) }),
      ...(usage ? { usage } : {}),
      ...(message.stop ? { stop: message.stop } : {}),
      ...(message.error ? { error: message.error } : {}),
    });
  }

  toolResult(
    callId: string,
    result: unknown,
    options: { name?: string; isError?: boolean } = {},
  ): string {
    const value = toJson(result === undefined ? null : result, 'tool result');
    return this.append({
      type: 'message',
      role: 'tool',
      toolCallId: callId,
      ...(options.name ? { toolName: options.name } : {}),
      content: typeof value === 'string' ? value : JSON.stringify(value),
      ...(typeof value === 'string' ? {} : { details: { result: value } }),
      ...(options.isError ? { isError: true } : {}),
    });
  }

  /** Appends one tree record after the active leaf (or below `parentId`). */
  append(input: RecordInput): string {
    if (this.sealed)
      throw new Error('The transcript is sealed: the run has ended');
    if (!isTreeRecord(input as EntryRecord))
      throw new Error(
        `Transcript records must be ATXF tree records; received type ${JSON.stringify((input as { type?: unknown }).type)}`,
      );
    this.flushUser();
    return this.add(input);
  }

  private add(input: RecordInput): string {
    const id = input.id ?? `ek-${++this.next}`;
    if (this.ids.has(id))
      throw new Error(`Transcript record ID ${id} is already used`);
    const parentId = input.parentId === undefined ? this.leaf : input.parentId;
    if (parentId !== null && !this.ids.has(parentId))
      throw new Error(
        `Transcript record ${id} names parent ${parentId}, which is not earlier in the transcript`,
      );
    const { hash: _, ...record } = {
      ...(input as object),
      id,
      time: input.time ?? this.source.now().toISOString(),
      parentId,
    } as TreeRecord;
    this.push(record as TreeRecord);
    return id;
  }

  private push(record: EntryRecord): void {
    const hashed = this.hasher.push(record);
    this.entries.push(hashed);
    this.ids.add(hashed.id);
    if (isTreeRecord(hashed)) this.leaf = hashed.id;
    else if (hashed.type === 'leaf') this.leaf = hashed.targetId;
    this.save(hashed);
    try {
      this.source.onRecord?.(hashed);
    } catch {
      // Progress display must never affect a run.
    }
  }

  private flushUser(): void {
    if (this.pendingUser === undefined) return;
    const text = this.pendingUser;
    this.pendingUser = undefined;
    this.add({
      type: 'message',
      role: 'user',
      content: text,
      origin: { kind: 'synthetic', name: 'evalkit' },
    });
  }

  private importTranscript(transcript: Transcript): void {
    if (this.sealed)
      throw new Error('The transcript is sealed: the run has ended');
    const fresh = transcript.records.filter(
      (record) => record.type !== 'seal' && !this.imported.has(record.id),
    );
    if (!fresh.length) return;
    // A user message with the text EvalKit is about to write stands for it.
    const standsFor = fresh.findIndex(
      (record) =>
        record.type === 'message' &&
        record.role === 'user' &&
        contentText(record.content) === this.pendingUser,
    );
    if (standsFor === -1) this.flushUser();
    else this.pendingUser = undefined;
    // The imported session's roots hang below what EvalKit wrote before it.
    if (this.importBase === undefined) this.importBase = this.leaf;
    for (const record of fresh) {
      if (this.ids.has(record.id))
        throw new Error(
          `Imported record ID ${record.id} is already used in this transcript`,
        );
      const { hash: _, ...unhashed } = record;
      const placed =
        isTreeRecord(record) && record.parentId === null
          ? { ...unhashed, parentId: this.importBase }
          : unhashed;
      this.imported.add(record.id);
      this.push(placed as EntryRecord);
    }
  }

  /** Every usage reported so far that ATXF counts toward the total. */
  *usages(): Iterable<Usage> {
    for (const record of this.entries) {
      if (record.type === 'message' && record.role === 'assistant') {
        if (record.usage) yield record.usage;
      } else if (
        (record.type === 'compaction' || record.type === 'branch_summary') &&
        record.usage
      )
        yield record.usage;
      else if (record.type === 'usage' && !record.cumulative)
        yield record.usage;
    }
  }

  /** Appends the seal (ATXF §17.2); nothing can be appended after it. */
  seal(): void {
    if (this.sealed) return;
    this.flushUser();
    const seal = this.hasher.seal(
      `ek-seal-${++this.next}`,
      this.source.now().toISOString(),
    );
    this.entries.push(seal);
    this.ids.add(seal.id);
    this.save(seal);
    this.sealed = true;
    // Sub-agent transcripts are sealed as they were last given.
    for (const [id, transcript] of this.subagentTranscripts) {
      const records = transcript.records.filter(
        (record) => record.type !== 'seal',
      );
      const last = records.at(-1)?.time ?? transcript.header.time;
      const sealed = addIntegrity(
        { header: transcript.header, records },
        { seal: { id: `ek-seal-${id}`, time: last } },
      );
      this.subagentTranscripts.set(id, sealed);
      this.saveSubagent(id, sealed);
    }
  }

  /** What the ATXF validator finds wrong with the transcript and its sub-agents'; empty when valid. */
  problems(): string[] {
    const check = (transcript: Transcript, prefix: string) =>
      validateTranscript(serializeTranscript(transcript))
        .diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
        .map(
          (diagnostic) =>
            `${prefix}${diagnostic.line ? `line ${diagnostic.line}: ` : ''}${diagnostic.message}`,
        );
    return [
      ...check(this.transcript, ''),
      ...[...this.subagentTranscripts].flatMap(([id, transcript]) =>
        check(transcript, `sub-agent ${id}: `),
      ),
    ];
  }

  private save(line: TranscriptHeader | EntryRecord): void {
    const persist = this.source.persist;
    if (!persist) return;
    this.writes = this.writes.then(() =>
      persist(line).catch((error: unknown) => {
        this.writeError ??= error;
      }),
    );
  }
}

/** ATXF tool arguments are an object; anything else is kept under `value`. */
function toolArguments(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const json = toJson(value, 'tool arguments');
  return typeof json === 'object' && json !== null && !Array.isArray(json)
    ? json
    : { value: json };
}
