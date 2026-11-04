import {
  canonicalParameters,
  toJson,
  type AssistantMessage,
  type EntryRecord,
  type JsonValue,
  type TurnView,
} from '@evalkit/core';
import {
  callsIn,
  contentText,
  isTreeRecord,
  toolResultValue,
} from '@evalkit/core/transcript';

/** Freeze one turn's records at send() completion, before checkpoint events arrive. */
export function turnView(
  records: readonly EntryRecord[],
  userStepIndex: number,
): TurnView {
  const tree = records.filter(isTreeRecord);
  const assistantMessages = tree.filter(
    (record): record is AssistantMessage =>
      record.type === 'message' && record.role === 'assistant',
  );
  const calls = callsIn(tree);
  const resultCount = new Map<string, number>();
  for (const record of tree)
    if (record.type === 'message' && record.role === 'tool')
      resultCount.set(
        record.toolCallId,
        (resultCount.get(record.toolCallId) ?? 0) + 1,
      );
  const last = assistantMessages.at(-1);
  const lastText = last ? contentText(last.content) : undefined;
  return {
    userStepIndex,
    records: tree,
    assistantMessages,
    toolCalls: calls.map(({ message, call, result }) => {
      const ambiguous =
        calls.filter((entry) => entry.call.id === call.id).length !== 1 ||
        (resultCount.get(call.id) ?? 0) > 1;
      return {
        messageId: message.id,
        id: call.id,
        name: call.name,
        arguments: toJson(call.arguments ?? {}, 'tool arguments'),
        resultObservation: ambiguous
          ? ('ambiguous' as const)
          : result
            ? ('observed' as const)
            : ('absent' as const),
        ...(!ambiguous && result
          ? { result: toJson(toolResultValue(result), 'tool result') }
          : {}),
      };
    }),
    ...(lastText ? { lastAssistantText: lastText } : {}),
  };
}

/** Exact JSON matching: object keys do not matter, array order does. */
export function matchingToolCall(
  turn: TurnView,
  name: string,
  args?: JsonValue,
) {
  const expected = args === undefined ? undefined : canonicalParameters(args);
  return turn.toolCalls.find(
    (call) =>
      call.name === name &&
      (expected === undefined ||
        canonicalParameters(call.arguments) === expected),
  );
}
