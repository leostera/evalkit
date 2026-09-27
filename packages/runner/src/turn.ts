import {
  canonicalParameters,
  type AutEvent,
  type JsonValue,
  type TrajectoryEvent,
  type TurnView,
} from '@evalkit/core';

type AutTrajectoryEvent = AutEvent & { source: 'aut' };

/** Freeze the observation window at send() completion, before checkpoint events arrive. */
export function turnView(
  events: readonly TrajectoryEvent[],
  start: number,
  end: number,
  userStepIndex: number,
): TurnView {
  const window = events.slice(start, end);
  const autEvents = window.filter(
    (event): event is AutTrajectoryEvent => event.source === 'aut',
  );
  const assistantMessages = autEvents.filter(
    (
      event,
    ): event is Extract<AutEvent, { kind: 'message' }> & {
      role: 'assistant';
      source: 'aut';
    } => event.kind === 'message' && event.role === 'assistant',
  );
  const calls = window.flatMap((event, index) =>
    event.source === 'aut' && event.kind === 'tool-call'
      ? [{ event, eventIndex: start + index }]
      : [],
  );
  const results = autEvents.filter(
    (
      event,
    ): event is Extract<AutEvent, { kind: 'tool-result' }> & {
      source: 'aut';
    } => event.kind === 'tool-result',
  );
  return {
    userStepIndex,
    events: autEvents,
    assistantMessages,
    toolCalls: calls.map(({ event, eventIndex }) => {
      const matches = results.filter((result) => result.id === event.id);
      const ambiguous =
        calls.filter((call) => call.event.id === event.id).length !== 1 ||
        matches.length > 1;
      return {
        eventIndex,
        id: event.id,
        name: event.name,
        arguments: event.arguments,
        resultObservation: ambiguous
          ? ('ambiguous' as const)
          : matches.length
            ? ('observed' as const)
            : ('absent' as const),
        ...(!ambiguous && matches.length ? { result: matches[0]!.result } : {}),
      };
    }),
    ...(typeof assistantMessages.at(-1)?.content === 'string'
      ? { lastAssistantText: assistantMessages.at(-1)!.content as string }
      : {}),
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
