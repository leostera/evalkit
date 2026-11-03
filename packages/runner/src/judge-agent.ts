import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  JsonValueSchema,
  TrajectoryEventSchema,
  normalizeAutEvent,
  turnResultEvents,
  type AutAdapter,
  type AutContext,
  type AutEvent,
  type AutSession,
  type JudgeRule,
  type JudgeRunInfo,
  type JsonValue,
  type ScoringContext,
  type TrajectoryEvent,
  type Usage,
} from '@evalkit/core';
import {
  answerInstruction,
  judgeInputNames,
  judgePrompt,
  readJudgeAnswer,
  UnreadableAnswer,
  type JudgeReading,
} from '@evalkit/core/judge';
import { RuleExecutionError } from './errors.js';
import type { JudgedScore } from './score.js';

const failure = (name: string, cause: unknown) =>
  new RuleExecutionError({
    name,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

/** A long tool result or reply is cut to this many characters in a judge's conversation. */
const MAX_PART = 4000;

/**
 * Drives one judge agent session for one assessment: builds the prompt from
 * the rule, sends it, reads the answer in the rule's format, and asks once
 * more if it cannot. Its events stay out of the AUT trajectory.
 */
export function runJudgeAgent(
  rule: JudgeRule,
  agent: AutAdapter,
  input: ScoringContext,
  placement: 'transcript' | 'scoring',
): Effect.Effect<{ value: JudgedScore }, RuleExecutionError> {
  return Effect.tryPromise({
    try: () => judgeOnce(rule, agent, input, placement),
    catch: (cause) =>
      cause instanceof RuleExecutionError ? cause : failure(rule.name, cause),
  });
}

async function judgeOnce(
  rule: JudgeRule,
  agent: AutAdapter,
  input: ScoringContext,
  placement: 'transcript' | 'scoring',
): Promise<{ value: JudgedScore }> {
  const inputs = judgeInputNames(rule);
  const values = await inputValues(rule, input, placement);
  const prompt = judgePrompt({
    rubric: rule.rubric,
    answer: rule.answer,
    inputs,
    values,
  });
  const events: AutEvent[] = [];
  const context: AutContext = {
    ...input.context,
    // Judges see every dataset value and work in evaluator space, not the candidate's mutable workspace.
    data: input.data,
    workspace: input.artifacts.evaluator,
    evaluatorWorkspace: input.artifacts.evaluator,
  };
  const session: AutSession = await agent.start({
    context,
    // A judge's files are the run's attachments too.
    attach: input.attach,
    onEvent: (event) => {
      const observed = Schema.decodeUnknownSync(TrajectoryEventSchema)({
        ...normalizeAutEvent(event, () => new Date()),
        source: 'aut',
      });
      if (observed.source !== 'aut')
        throw new Error('Invalid judge event source');
      const { source: _, ...validated } = observed;
      events.push(validated);
    },
  });
  let reading: JudgeReading | undefined;
  let reply: JsonValue | undefined;
  let attempts = 0;
  try {
    let message = prompt;
    let problem = '';
    while (attempts < 2 && !reading) {
      attempts += 1;
      const from = events.length;
      const result = await session.send(message);
      if (result !== undefined)
        events.push(...turnResultEvents(result, attempts, () => new Date()));
      reply = replyIn(events.slice(from));
      if (reply === undefined) {
        problem = 'it did not reply';
      } else {
        try {
          reading = readJudgeAnswer(rule.answer, reply);
        } catch (error) {
          if (!(error instanceof UnreadableAnswer)) throw error;
          problem = error.message;
        }
      }
      message = `Your answer could not be read: ${problem}. Answer again, only in this format.\n\n${answerInstruction(rule.answer)}`;
    }
    if (!reading)
      throw new Error(
        `Judge ${rule.name}'s answer could not be read after ${attempts} tries: ${problem}${reply === undefined ? '' : `. Its last reply: ${preview(reply)}`}`,
      );
  } finally {
    await session.close?.();
  }
  const recorded = Schema.decodeUnknownSync(JsonValueSchema)(events);
  const model = lastOf(
    events,
    (event) => event.kind === 'turn-completed' && event.model,
  );
  const usage = totalUsage(events);
  const judge: JudgeRunInfo = {
    ...(agent.identity ? { agent: agent.identity } : {}),
    ...(model?.kind === 'turn-completed' && model.model
      ? { model: model.model }
      : {}),
    ...(usage ? { usage } : {}),
    prompt,
    ...(reply !== undefined ? { reply } : {}),
    ...(attempts > 1 ? { attempts } : {}),
    events: recorded as JsonValue[],
  };
  return { value: { ...reading, judge } };
}

/** Each input's text: what the rule's function returned, or the defaults. */
async function inputValues(
  rule: JudgeRule,
  input: ScoringContext,
  placement: 'transcript' | 'scoring',
): Promise<Record<string, string>> {
  if (!rule.inputs)
    return {
      conversation: conversationText(input.trajectory.events, placement),
      reply: text(input.output),
    };
  const values: Record<string, string> = {};
  for (const [name, read] of Object.entries(rule.inputs))
    values[name] = text(await read(input));
  return values;
}

/** The run's conversation as plain lines, for a judge to read: this turn at a checkpoint, else all of it. */
export function conversationText(
  events: readonly TrajectoryEvent[],
  placement: 'transcript' | 'scoring',
): string {
  let start = 0;
  if (placement === 'transcript')
    events.forEach((event, index) => {
      if (event.kind === 'transcript-step-started' && 'message' in event)
        start = index;
    });
  const lines: string[] = [];
  for (const event of events.slice(start)) {
    if (event.kind === 'transcript-step-started' && 'message' in event)
      lines.push(`User: ${cut(text(event.message as JsonValue))}`);
    else if (event.source !== 'aut') continue;
    else if (event.kind === 'message')
      lines.push(`${capitalize(event.role)}: ${cut(text(event.content))}`);
    else if (event.kind === 'tool-call')
      lines.push(`Tool call ${event.name}: ${cut(text(event.arguments))}`);
    else if (event.kind === 'tool-result')
      lines.push(
        `Tool result ${event.name ?? event.id}: ${cut(text(event.result))}`,
      );
  }
  return lines.join('\n') || '(nothing happened)';
}

/** The judge's answer in one attempt's events: its final output, else its last reply. */
function replyIn(events: readonly AutEvent[]): JsonValue | undefined {
  const completed = lastOf(
    events,
    (event) => event.kind === 'completed' && event.output !== undefined,
  );
  if (completed?.kind === 'completed') return completed.output;
  const assistant = lastOf(
    events,
    (event) => event.kind === 'message' && event.role === 'assistant',
  );
  return assistant?.kind === 'message' ? assistant.content : undefined;
}

function totalUsage(events: readonly AutEvent[]): Usage | undefined {
  let total: Usage | undefined;
  for (const event of events) {
    if (event.kind !== 'turn-completed' || !event.usage) continue;
    total ??= {};
    for (const [key, tokens] of Object.entries(event.usage) as [
      keyof Usage,
      number | undefined,
    ][])
      if (tokens !== undefined) total[key] = (total[key] ?? 0) + tokens;
  }
  return total;
}

function text(value: JsonValue | undefined): string {
  if (value === undefined) return '(none)';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function cut(value: string): string {
  return value.length > MAX_PART
    ? `${value.slice(0, MAX_PART)}… (${value.length - MAX_PART} more characters)`
    : value;
}

function preview(value: JsonValue): string {
  const shown = text(value).replace(/\s+/g, ' ');
  return shown.length > 300 ? `${shown.slice(0, 300)}…` : shown;
}

/** The last element matching, scanning from the end (no ES2023 lib here). */
function lastOf<T>(
  items: readonly T[],
  match: (item: T) => unknown,
): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1)
    if (match(items[index]!)) return items[index];
  return undefined;
}

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);
