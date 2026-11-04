import { expect, test } from 'bun:test';
import type { RunEvent, Transcript } from '@evalkit/core';
import { builtInMetrics } from './metrics.js';

const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();

const transcript = (records: Transcript['records']): Transcript => ({
  header: {
    type: 'transcript',
    atxf: '0.1',
    id: 'run',
    time: at(0),
    source: { agent: 'test' },
  },
  records,
});

test('built-in metrics: agent time before scoring, tokens with and without cache, steps, tool calls', () => {
  const records: Transcript['records'] = [
    {
      type: 'message',
      id: 'u',
      parentId: null,
      time: at(5),
      role: 'user',
      content: 'go',
    },
    {
      type: 'message',
      id: 'a1',
      parentId: 'u',
      time: at(10),
      role: 'assistant',
      content: [{ type: 'tool_call', id: '1', name: 'bash', arguments: {} }],
      usage: { input: 100, cacheRead: 300, output: 20 },
    },
    {
      type: 'message',
      id: 't1',
      parentId: 'a1',
      time: at(400),
      role: 'tool',
      toolCallId: '1',
      content: 'ok',
    },
    {
      type: 'message',
      id: 'a2',
      parentId: 't1',
      time: at(900),
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
      // A provider that reports only a total.
      usage: { input: 0, output: 0, total: 30 },
    },
  ];
  const events: RunEvent[] = [
    { kind: 'run-started', timestamp: at(0), at: null },
    { kind: 'scorer-started', scorer: 's', timestamp: at(5000), at: 'a2' },
  ];
  expect(builtInMetrics(transcript(records), events)).toEqual([
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
    { name: 'cached tokens', value: 300, unit: 'tokens', builtIn: true },
    {
      name: 'output tokens',
      value: 20,
      unit: 'tokens',
      better: 'lower',
      builtIn: true,
    },
    { name: 'cache hit rate', value: 0.75, better: 'higher', builtIn: true },
    { name: 'steps', value: 2, better: 'lower', builtIn: true },
    { name: 'tool calls', value: 1, builtIn: true },
  ]);
  // No usage reported: no token metrics rather than misleading zeros.
  expect(
    builtInMetrics(transcript(records.slice(0, 1)), events.slice(0, 1)).map(
      (metric) => metric.name,
    ),
  ).toEqual(['agent time', 'steps', 'tool calls']);
});
