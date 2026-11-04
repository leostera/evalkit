import { expect, test } from 'bun:test';
import { verifyIntegrity } from '@leostera/atxf';
import type { EntryRecord, Transcript } from '@evalkit/core';
import { RunTranscript } from './run-transcript.js';

const clock = () => {
  let ms = 0;
  return () => new Date(Date.UTC(2026, 0, 1) + ms++ * 1000);
};
const transcript = (persist?: (line: unknown) => Promise<void>) =>
  new RunTranscript({
    id: 'run-1',
    agent: { id: 'agent', version: '1.0.0' },
    runId: 'run-1',
    scenarioId: 'scenario',
    now: clock(),
    ...(persist ? { persist } : {}),
  });
const roles = (records: readonly EntryRecord[]) =>
  records.map((record) =>
    record.type === 'message' ? record.role : record.type,
  );

test("EvalKit's prompt is written once: before the agent's first record, unless the agent wrote it", () => {
  const run = transcript();
  const writer = run.writer();
  run.scriptUser('hello');
  writer.assistant({ content: 'hi' });
  run.endTurn();
  run.scriptUser('again');
  writer.user('again');
  writer.assistant({ content: 'yes' });
  run.endTurn();
  run.scriptUser('silent');
  run.endTurn();
  expect(roles(run.transcript.records)).toEqual([
    'user',
    'assistant',
    'user',
    'assistant',
    'user',
  ]);
  // EvalKit's own prompts say so.
  expect(run.transcript.records[0]).toMatchObject({
    origin: { kind: 'synthetic', name: 'evalkit' },
  });
  expect(run.transcript.records[2]).not.toHaveProperty('origin');
});

test('a turn result becomes the call, its result and the reply, usage on the last message', () => {
  const run = transcript();
  run.scriptUser('order 7?');
  run.writeTurnResult(
    {
      reply: 'Tomorrow.',
      toolCalls: [{ name: 'lookup', arguments: { id: 7 }, result: { eta: 1 } }],
      usage: { input: 10, output: 2 },
      model: 'openai/gpt-x',
    },
    1,
  );
  run.endTurn();
  const [, call, result, reply] = run.transcript.records;
  expect(roles(run.transcript.records)).toEqual([
    'user',
    'assistant',
    'tool',
    'assistant',
  ]);
  expect(call).toMatchObject({
    content: [{ type: 'tool_call', id: 'turn-1-call-1', name: 'lookup' }],
  });
  expect(call).not.toHaveProperty('usage');
  expect(result).toMatchObject({
    toolCallId: 'turn-1-call-1',
    details: { result: { eta: 1 } },
  });
  expect(reply).toMatchObject({
    model: { provider: 'openai', id: 'gpt-x' },
    usage: { input: 10, output: 2 },
  });
  // Usage with no reply and no calls is kept as a usage record.
  run.writeTurnResult({ usage: { total: 5 } }, 2);
  expect(run.transcript.records.at(-1)).toMatchObject({
    type: 'usage',
    usage: { total: 5 },
  });
});

test('importing a converted session appends only what is new, keeping its IDs', () => {
  const session = (count: number): Transcript => ({
    header: {
      type: 'transcript',
      atxf: '0.1',
      id: 'pi-session',
      time: '2026-01-01T00:00:00.000Z',
      source: { agent: 'pi' },
    },
    records: [
      {
        type: 'message',
        id: 'p1',
        parentId: null,
        time: '2026-01-01T00:00:00.000Z',
        role: 'user',
        content: 'hello',
      },
      {
        type: 'message',
        id: 'p2',
        parentId: 'p1',
        time: '2026-01-01T00:00:01.000Z',
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
      },
      {
        type: 'message',
        id: 'p3',
        parentId: 'p2',
        time: '2026-01-01T00:00:02.000Z',
        role: 'user',
        content: 'more',
      },
      {
        type: 'message',
        id: 'p4',
        parentId: 'p3',
        time: '2026-01-01T00:00:03.000Z',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
      },
    ].slice(0, count) as Transcript['records'],
  });
  const run = transcript();
  const writer = run.writer();
  run.scriptUser('hello');
  writer.import(session(2));
  run.endTurn();
  run.scriptUser('more');
  writer.import(session(4));
  run.endTurn();
  // The session's own user messages stand for EvalKit's prompts.
  expect(run.transcript.records.map((record) => record.id)).toEqual([
    'p1',
    'p2',
    'p3',
    'p4',
  ]);
});

test('a sealed transcript verifies, refuses more records, and is saved line by line in order', async () => {
  const lines: unknown[] = [];
  const run = transcript(async (line) => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
    lines.push(line);
  });
  run.scriptUser('hello');
  run.writer().assistant({ content: 'hi' });
  run.seal();
  expect(run.problems()).toEqual([]);
  expect(verifyIntegrity(run.transcript)).toEqual([]);
  expect(() => run.writer().assistant({ content: 'late' })).toThrow('sealed');
  await run.settled();
  expect(lines).toEqual([run.header, ...run.transcript.records]);
});

test('records must name an earlier parent and a fresh ID', () => {
  const run = transcript();
  const writer = run.writer();
  writer.assistant({ content: 'one' });
  expect(() =>
    writer.append({
      type: 'message',
      role: 'user',
      content: 'x',
      parentId: 'nope',
    }),
  ).toThrow('names parent nope');
  expect(() =>
    writer.append({ type: 'message', role: 'user', content: 'x', id: 'ek-1' }),
  ).toThrow('already used');
});
