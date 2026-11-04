import { Effect } from 'effect';
import {
  type AutAdapter,
  type AutContext,
  type AutSession,
  type JudgeRule,
  type JudgeRunInfo,
  type JsonValue,
  type MessageRecord,
  type ScoringContext,
  type Transcript,
} from '@evalkit/core';
import { activePath, contentText, modelName } from '@evalkit/core/transcript';
import { transcriptUsage } from '@evalkit/core/usage';
import {
  answerInstruction,
  judgeInputNames,
  judgePrompt,
  readJudgeAnswer,
  UnreadableAnswer,
  type JudgeReading,
} from '@evalkit/core/judge';
import { RuleExecutionError } from './errors.js';
import { RunTranscript } from './run-transcript.js';
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
 * more if it cannot. Its session is its own transcript, never the agent's.
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

let judgeSessions = 0;

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
  const now = () => new Date();
  const transcript = new RunTranscript({
    id: `${input.context.runId}-judge-${++judgeSessions}`,
    agent: {
      id: agent.identity?.id ?? 'judge',
      ...(agent.identity?.version ? { version: agent.identity.version } : {}),
    },
    runId: input.context.runId,
    scenarioId: input.context.evalId,
    now,
  });
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
    transcript: transcript.writer(),
  });
  let reading: JudgeReading | undefined;
  let reply: JsonValue | undefined;
  let attempts = 0;
  try {
    let message = prompt;
    let problem = '';
    while (attempts < 2 && !reading) {
      attempts += 1;
      const from = transcript.length;
      transcript.scriptUser(message);
      const result = await session.send(message);
      if (result !== undefined) transcript.writeTurnResult(result, attempts);
      transcript.endTurn();
      reply = replyIn(transcript.since(from));
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
  transcript.seal();
  const problems = transcript.problems();
  if (problems.length)
    throw new Error(
      `Judge ${rule.name}'s transcript is not valid ATXF: ${problems.slice(0, 3).join('; ')}`,
    );
  const recorded: Transcript = transcript.transcript;
  const model = lastOf(
    recorded.records,
    (record) =>
      record.type === 'message' &&
      record.role === 'assistant' &&
      record.model !== undefined,
  );
  const usage = transcriptUsage(recorded);
  const judge: JudgeRunInfo = {
    ...(agent.identity ? { agent: agent.identity } : {}),
    ...(model?.type === 'message' && model.role === 'assistant' && model.model
      ? { model: modelName(model.model)! }
      : {}),
    ...(usage ? { usage } : {}),
    prompt,
    ...(reply !== undefined ? { reply } : {}),
    ...(attempts > 1 ? { attempts } : {}),
    transcript: recorded,
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
      conversation: conversationText(input.transcript, placement),
      reply: text(input.output),
    };
  const values: Record<string, string> = {};
  for (const [name, read] of Object.entries(rule.inputs))
    values[name] = text(await read(input));
  return values;
}

/**
 * The agent's conversation as plain lines, for a judge to read: this turn
 * (from the last user message) at a checkpoint, else all of it.
 */
export function conversationText(
  transcript: Transcript,
  placement: 'transcript' | 'scoring',
): string {
  let path = activePath(transcript);
  if (placement === 'transcript') {
    let start = 0;
    path.forEach((record, index) => {
      if (record.type === 'message' && record.role === 'user') start = index;
    });
    path = path.slice(start);
  }
  const lines: string[] = [];
  for (const record of path) {
    if (record.type !== 'message') continue;
    if (record.role === 'tool')
      lines.push(
        `Tool result ${record.toolName ?? record.toolCallId}: ${cut(contentText(record.content))}`,
      );
    else if (record.role === 'assistant') {
      const said = contentText(record.content);
      if (said) lines.push(`Assistant: ${cut(said)}`);
      for (const block of record.content)
        if (block.type === 'tool_call')
          lines.push(
            `Tool call ${block.name}: ${cut(block.input ?? JSON.stringify(block.arguments ?? {}, null, 2))}`,
          );
    } else
      lines.push(
        `${capitalize(record.role)}: ${cut(contentText(record.content))}`,
      );
  }
  return lines.join('\n') || '(nothing happened)';
}

/** The judge's answer in one attempt: the text of its last reply. */
function replyIn(
  records: readonly Transcript['records'][number][],
): JsonValue | undefined {
  const assistant = lastOf(
    records,
    (record) => record.type === 'message' && record.role === 'assistant',
  ) as (MessageRecord & { role: 'assistant' }) | undefined;
  if (!assistant) return undefined;
  const said = contentText(assistant.content);
  return said || undefined;
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
