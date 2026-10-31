import { expect, test } from 'bun:test';
import type { TrajectoryEvent } from '@evalkit/core';
import { builtInMetrics } from './metrics.js';

const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();

test('built-in metrics: agent time before scoring, reported tokens, tool calls', () => {
  const events: TrajectoryEvent[] = [
    { source: 'runner', kind: 'trial-started', timestamp: at(0) },
    {
      source: 'aut',
      kind: 'tool-call',
      id: '1',
      name: 'bash',
      arguments: {},
      timestamp: at(10),
    },
    {
      source: 'aut',
      kind: 'turn-completed',
      turn: 1,
      usage: { inputTokens: 100, outputTokens: 20 },
      timestamp: at(500),
    },
    {
      source: 'aut',
      kind: 'turn-completed',
      turn: 2,
      usage: { totalTokens: 30 },
      timestamp: at(900),
    },
    {
      source: 'runner',
      kind: 'scorer-started',
      scorer: 's',
      timestamp: at(5000),
    },
  ];
  expect(builtInMetrics(events)).toEqual([
    {
      name: 'agent time',
      value: 900,
      unit: 'ms',
      better: 'lower',
      builtIn: true,
    },
    {
      name: 'tokens',
      value: 150,
      unit: 'tokens',
      better: 'lower',
      builtIn: true,
    },
    { name: 'tool calls', value: 1, builtIn: true },
  ]);
  // No usage reported: no token metric rather than a misleading zero.
  expect(builtInMetrics(events.slice(0, 2)).map((m) => m.name)).toEqual([
    'agent time',
    'tool calls',
  ]);
});
