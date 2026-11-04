import { describe, expect, test } from 'bun:test';
import type { RunEvent, Transcript } from '@evalkit/core';
import {
  formatDuration,
  formatUsage,
  placeEvents,
  trajectoryView,
} from './trajectory-view.js';

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString();

function transcript(
  records: Array<Record<string, unknown>>,
  id = 'run',
): Transcript {
  let parentId: string | null = null;
  return {
    header: {
      type: 'transcript',
      atxf: '0.1',
      id,
      time: at(0),
      source: { agent: 'test' },
    },
    records: records.map((record, index) => {
      const full = {
        id: `r${index + 1}`,
        parentId,
        time: at(index + 1),
        ...record,
      };
      parentId = full.id as string;
      return full;
    }) as unknown as Transcript['records'],
  };
}

const user = (content: string, scripted = false) => ({
  type: 'message',
  role: 'user',
  content,
  ...(scripted ? { origin: { kind: 'synthetic', name: 'evalkit' } } : {}),
});
const assistant = (content: unknown[], extra: object = {}) => ({
  type: 'message',
  role: 'assistant',
  content,
  ...extra,
});
const text = (value: string) => ({ type: 'text', text: value });
const call = (id: string, name: string, args: object) => ({
  type: 'tool_call',
  id,
  name,
  arguments: args,
});
const result = (toolCallId: string, value: unknown, isError = false) => ({
  type: 'message',
  role: 'tool',
  toolCallId,
  content: JSON.stringify(value),
  details: { result: value },
  ...(isError ? { isError } : {}),
});
const event = (kind: string, atId: string | null, extra: object = {}) =>
  ({ kind, at: atId, timestamp: at(0), ...extra }) as unknown as RunEvent;

describe('trajectoryView', () => {
  test('a turn per user message, calls paired with results, reasoning folded, usage summed', () => {
    const view = trajectoryView(
      transcript([
        user('Where is order 7?', true),
        assistant(
          [
            { type: 'reasoning', text: 'Look it up first.' },
            call('c1', 'lookup', { id: 7 }),
          ],
          { usage: { input: 100, cacheRead: 900, output: 10 } },
        ),
        result('c1', { eta: 'tomorrow' }),
        assistant([text('Tomorrow.')], {
          model: { provider: 'openai', id: 'gpt-x' },
          usage: { input: 20, output: 5 },
        }),
        user('Thanks'),
        assistant([text('You are welcome.')]),
      ]),
    );
    expect(view.preamble).toEqual([]);
    expect(view.turns).toHaveLength(2);
    const [first, second] = view.turns;
    expect(first!.items.map((item) => item.type)).toEqual([
      'user',
      'reasoning',
      'tool',
      'assistant',
    ]);
    expect(first!.items[0]).toMatchObject({ scripted: true });
    expect(first!.items[2]).toMatchObject({
      name: 'lookup',
      arguments: { id: 7 },
      result: { value: { eta: 'tomorrow' }, durationMs: 1000, isError: false },
    });
    expect(first!.items[3]).toMatchObject({
      text: 'Tomorrow.',
      model: 'openai/gpt-x',
    });
    expect(first!.steps).toBe(2);
    expect(first!.usage).toEqual({ input: 120, cacheRead: 900, output: 15 });
    expect(first!.latencyMs).toBe(3000);
    expect(second!.items[0]).toMatchObject({ text: 'Thanks', scripted: false });
  });

  test("EvalKit's events are placed where they happened, by the record they name", () => {
    const recorded = transcript([
      user('go'),
      assistant([text('done')]),
      user('again'),
      assistant([text('done again')]),
    ]);
    const view = trajectoryView(recorded, [
      event('run-started', null),
      event('checkpoint-started', 'r2', { step: 1, name: 'replied' }),
      event('checkpoint-completed', 'r2', { step: 1, status: 'failed' }),
      event('transcript-step-skipped', 'r2', { step: 2 }),
      event('limit-reached', 'r4', { limit: 'steps', value: 1, used: 2 }),
      event('scorer-completed', 'r4', { scorer: 'final', value: 1 }),
    ]);
    expect(view.turns[0]!.items.map((item) => item.type)).toEqual([
      'user',
      'assistant',
      'checkpoint',
      'skipped-step',
    ]);
    expect(view.turns[0]!.items[2]).toMatchObject({ state: 'failed' });
    expect(view.turns[1]!.items.at(-1)).toEqual({
      type: 'limit',
      at: 0,
      limit: 'steps',
      value: 1,
      used: 2,
    });
    expect(view.scorers).toEqual([{ name: 'final', value: 1, skipped: false }]);
  });

  test('only the active path is shown; an event on an abandoned branch follows the record before it', () => {
    const recorded = transcript([user('go'), assistant([text('first try')])]);
    recorded.records.push({
      type: 'message',
      id: 'r3',
      parentId: 'r1',
      time: at(3),
      role: 'assistant',
      content: [text('second try')],
    } as unknown as Transcript['records'][number]);
    const entries = placeEvents(recorded, [
      event('checkpoint-started', 'r2', { step: 1, name: 'x' }),
    ]);
    expect(
      entries.map((entry) =>
        entry.kind === 'record' ? entry.record.id : entry.event.kind,
      ),
    ).toEqual(['r1', 'checkpoint-started', 'r3']);
  });

  test('tool errors, results without calls, compactions and sub-agents', () => {
    const child = transcript(
      [user('count files'), assistant([text('3')])],
      'child',
    );
    const view = trajectoryView(
      transcript([
        user('go'),
        assistant([call('c1', 'bash', { command: 'false' })]),
        result('c1', 'exit 1', true),
        result('orphan', 'late'),
        {
          type: 'compaction',
          strategy: 'summary',
          summary: 'Earlier: setup.',
          tokensBefore: 90_000,
        },
        {
          type: 'agent_link',
          relation: 'spawn',
          transcriptId: 'child',
          agent: { name: 'counter' },
        },
        {
          type: 'custom',
          namespace: 'pi',
          name: 'thinking-level',
          data: { level: 'high' },
        },
        { type: 'usage', kind: 'turn', usage: { input: 5, output: 1 } },
      ]),
      [],
      { child },
    );
    const items = view.turns[0]!.items;
    expect(items.map((item) => item.type)).toEqual([
      'user',
      'tool',
      'tool',
      'compaction',
      'subagent',
      'unknown',
    ]);
    expect(items[1]).toMatchObject({ result: { isError: true } });
    expect(items[2]).toMatchObject({ id: 'orphan', name: 'tool' });
    expect(items[4]).toMatchObject({ name: 'counter', transcriptId: 'child' });
    const nested = items[4]!.type === 'subagent' ? items[4]!.view : undefined;
    expect(nested?.turns[0]!.items.map((item) => item.type)).toEqual([
      'user',
      'assistant',
    ]);
    expect(items[5]).toMatchObject({ label: 'pi · thinking-level' });
    // A usage record counts toward its turn without showing as a row.
    expect(view.turns[0]!.usage).toEqual({ input: 5, output: 1 });
  });

  test('nothing recorded yet', () => {
    expect(trajectoryView(null)).toEqual({
      preamble: [],
      turns: [],
      scorers: [],
    });
  });
});

describe('formatting', () => {
  test('durations and usage: cache reads are shown apart from tokens', () => {
    expect(formatDuration(0.4)).toBe('<1ms');
    expect(formatDuration(1400)).toBe('1.40s');
    expect(formatDuration(123_000)).toBe('2m 03s');
    expect(formatUsage({ input: 900, output: 304, cacheRead: 8000 })).toBe(
      '1,204 tokens (900 in · 304 out · 8,000 cached)',
    );
    expect(formatUsage({ input: 0, output: 0, total: 30 })).toBe('30 tokens');
  });
});
