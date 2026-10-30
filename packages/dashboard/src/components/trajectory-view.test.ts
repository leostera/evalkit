import { describe, expect, test } from 'bun:test';
import type { TrajectoryEvent } from '../api.js';
import {
  formatDuration,
  formatUsage,
  trajectoryView,
} from './trajectory-view.js';

const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();
const runner = (
  ms: number,
  kind: string,
  fields: object = {},
): TrajectoryEvent => ({
  source: 'runner',
  kind,
  timestamp: at(ms),
  ...fields,
});
const aut = (
  ms: number,
  kind: string,
  fields: object = {},
): TrajectoryEvent => ({
  source: 'aut',
  kind,
  timestamp: at(ms),
  ...fields,
});

describe('trajectoryView', () => {
  test('groups a turn under its prompt and folds bookkeeping away', () => {
    const view = trajectoryView([
      runner(0, 'trial-started'),
      aut(1, 'started'),
      runner(2, 'transcript-step-started', { step: 0, message: 'Write 2112' }),
      aut(3, 'turn-started', { turn: 1 }),
      aut(4, 'message', { role: 'user', content: 'Write 2112' }),
      aut(5, 'tool-call', {
        id: 'w1',
        name: 'write_file',
        arguments: { path: 'n.txt' },
      }),
      aut(9, 'tool-result', { id: 'w1', result: { ok: true } }),
      aut(10, 'message', { role: 'assistant', content: 'Done' }),
      aut(11, 'turn-completed', {
        turn: 1,
        latencyMs: 8,
        usage: { inputTokens: 10, outputTokens: 4 },
      }),
      runner(12, 'transcript-step-completed', { step: 0 }),
      aut(13, 'completed', { output: 'Done' }),
      runner(14, 'trial-completed'),
    ]);
    expect(view.preamble).toEqual([]);
    expect(view.durationMs).toBe(14);
    expect(view.turns).toEqual([
      {
        turn: 1,
        latencyMs: 8,
        usage: { inputTokens: 10, outputTokens: 4, totalTokens: undefined },
        items: [
          { type: 'user', at: 2, text: 'Write 2112' },
          {
            type: 'tool',
            at: 5,
            id: 'w1',
            name: 'write_file',
            arguments: { path: 'n.txt' },
            result: { value: { ok: true }, durationMs: 4 },
          },
          { type: 'assistant', at: 10, content: 'Done' },
        ],
      },
    ]);
  });

  test('merges checkpoints into one verdict and keeps skipped steps', () => {
    const view = trajectoryView([
      runner(0, 'transcript-step-started', { step: 0, message: 'Hi' }),
      runner(1, 'checkpoint-started', { step: 1, name: 'replied' }),
      runner(3, 'checkpoint-completed', { step: 1, status: 'failed' }),
      runner(4, 'checkpoint-started', { step: 2, name: 'judge' }),
      runner(6, 'checkpoint-error', {
        step: 2,
        error: { name: 'TypeError', message: 'boom' },
      }),
      runner(7, 'transcript-step-skipped', { step: 3 }),
    ]);
    expect(view.turns[0]!.items.slice(1)).toEqual([
      {
        type: 'checkpoint',
        at: 1,
        step: 1,
        name: 'replied',
        state: 'failed',
        durationMs: 2,
      },
      {
        type: 'checkpoint',
        at: 4,
        step: 2,
        name: 'judge',
        state: 'error',
        durationMs: 2,
        error: { name: 'TypeError', message: 'boom', stack: undefined },
      },
      { type: 'skipped-step', at: 7, step: 3 },
    ]);
  });

  test('older trajectories without a recorded prompt open a turn per AUT turn', () => {
    const view = trajectoryView([
      runner(0, 'transcript-step-started', { step: 0 }),
      aut(1, 'turn-started', { turn: 1 }),
      aut(2, 'message', { role: 'assistant', content: 'one' }),
      aut(3, 'turn-started', { turn: 2 }),
      aut(4, 'message', { role: 'assistant', content: 'two' }),
    ]);
    expect(view.turns.map((turn) => [turn.turn, turn.items.length])).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  test('summarises scorers, keeps unmatched results, errors and unknown kinds', () => {
    const view = trajectoryView([
      aut(0, 'tool-result', { id: 'x', name: 'lookup', result: 1 }),
      aut(1, 'error', { error: { name: 'Error', message: 'crashed' } }),
      aut(2, 'mystery', { detail: true }),
      aut(3, 'completed', { output: { answer: 42 } }),
      runner(4, 'scorer-started', { scorer: 'exact' }),
      runner(7, 'scorer-completed', { scorer: 'exact', value: 1 }),
      runner(8, 'scorer-started', { scorer: 'judge' }),
      runner(9, 'scorer-failed', {
        scorer: 'judge',
        error: { message: 'no key' },
      }),
    ]);
    expect(view.preamble.map((item) => item.type)).toEqual([
      'tool',
      'error',
      'unknown',
      'output',
    ]);
    expect(view.scorers).toEqual([
      {
        name: 'exact',
        value: 1,
        skipped: false,
        error: undefined,
        durationMs: 3,
      },
      {
        name: 'judge',
        value: undefined,
        skipped: false,
        error: { name: undefined, message: 'no key', stack: undefined },
        durationMs: 1,
      },
    ]);
  });
});

test('formatDuration and formatUsage read naturally', () => {
  expect([0.4, 12, 1400, 12_340, 123_000].map(formatDuration)).toEqual([
    '<1ms',
    '12ms',
    '1.40s',
    '12.3s',
    '2m 03s',
  ]);
  expect(formatUsage({ inputTokens: 900, outputTokens: 304 })).toBe(
    '1,204 tokens (900 in · 304 out)',
  );
  expect(formatUsage({ totalTokens: 50 })).toBe('50 tokens');
});
