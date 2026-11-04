import { expect, test } from 'bun:test';
import {
  addIntegrity,
  serializeTranscript,
  validateTranscript,
} from '@leostera/atxf';
import {
  convertTrajectory,
  oldTokens,
  upgradeScoring,
  upgradeUsage,
  V6_TRAJECTORY_FORMAT,
} from './upgrade-transcript.js';
import { reportedUsages, uncachedTokens } from './usage.js';

test('old usage: input counted cached tokens; they become separate cache reads', () => {
  expect(
    upgradeUsage({
      inputTokens: 1000,
      cachedInputTokens: 800,
      outputTokens: 50,
    }),
  ).toEqual({ input: 200, cacheRead: 800, output: 50 });
  expect(upgradeUsage({ totalTokens: 30 })).toEqual({
    input: 0,
    output: 0,
    total: 30,
  });
  expect(upgradeUsage({})).toBeUndefined();
});

/** A small seeded generator, so a failure names a seed that reproduces it. */
function random(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  };
  return {
    int: (max: number) => Math.floor(next() * max),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
  };
}

/** A version 6 trajectory as 0.10 adapters could write it, in any order. */
function v6Trajectory(seed: number) {
  const r = random(seed);
  const at = (n: number) =>
    new Date(Date.UTC(2026, 9, 1) + n * 1000).toISOString();
  const events: Record<string, unknown>[] = [
    { source: 'runner', kind: 'run-started', timestamp: at(0) },
  ];
  const calls: string[] = [];
  let turn = 0;
  for (let i = 0, n = 1 + r.int(25); i < n; i++) {
    const time = at(i + 1);
    switch (
      r.pick([
        'prompt',
        'user',
        'assistant',
        'call',
        'result',
        'turn',
        'started',
        'error',
        'tool-message',
        'custom',
      ] as const)
    ) {
      case 'prompt':
        events.push({
          source: 'runner',
          kind: 'transcript-step-started',
          step: i,
          message: `prompt ${i}`,
          timestamp: time,
        });
        break;
      case 'user':
        events.push({
          source: 'aut',
          kind: 'message',
          role: 'user',
          content: r.pick(['hi', `prompt ${i - 1}`]),
          timestamp: time,
        });
        break;
      case 'assistant':
        events.push({
          source: 'aut',
          kind: 'message',
          role: 'assistant',
          content: r.pick(['ok', { structured: true }]),
          timestamp: time,
        });
        break;
      case 'call': {
        const id = r.pick([`c${i}`, 'dup']);
        calls.push(id);
        events.push({
          source: 'aut',
          kind: 'tool-call',
          id,
          name: r.pick(['ls', 'bash']),
          arguments: r.pick([{ a: 1 }, 'raw', null]),
          timestamp: time,
        });
        break;
      }
      case 'result':
        events.push({
          source: 'aut',
          kind: 'tool-result',
          id: calls.length ? r.pick(calls) : 'orphan',
          result: r.pick([{ ok: true }, 'text']),
          ...(r.int(4) === 0 ? { error: 'failed' } : {}),
          timestamp: time,
        });
        break;
      case 'turn': {
        const input = r.int(5000);
        const usage = r.pick([
          {
            inputTokens: input,
            outputTokens: r.int(500),
            cachedInputTokens: r.int(input + 1),
          },
          { inputTokens: input, outputTokens: r.int(500) },
          { totalTokens: r.int(9000) },
          { outputTokens: r.int(100) },
          undefined,
        ]);
        events.push({
          source: 'aut',
          kind: 'turn-completed',
          turn: ++turn,
          ...(usage ? { usage } : {}),
          ...(r.int(2) ? { model: r.pick(['openai/gpt-x', 'luna']) } : {}),
          timestamp: time,
        });
        break;
      }
      case 'started':
        events.push({
          source: 'aut',
          kind: r.pick(['started', 'completed']),
          timestamp: time,
        });
        break;
      case 'error':
        events.push({
          source: r.pick(['aut', 'runner']),
          kind: 'error',
          message: 'boom',
          timestamp: time,
        });
        break;
      case 'tool-message':
        events.push({
          source: 'aut',
          kind: 'message',
          role: r.pick(['tool', 'system']),
          content: 'note',
          timestamp: time,
        });
        break;
      case 'custom':
        events.push({
          source: 'aut',
          kind: 'custom',
          name: 'thinking',
          data: { n: i },
          timestamp: time,
        });
        break;
    }
  }
  events.push({ source: 'runner', kind: 'run-completed', timestamp: at(99) });
  return events;
}

test('property: any version 6 trajectory converts to valid ATXF that keeps every event and its tokens', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const events = v6Trajectory(seed);
    const converted = convertTrajectory(events, {
      runId: `run-${seed}`,
      evalId: 'scenario',
      startedAt: '2026-10-01T00:00:00.000Z',
      agent: { id: 'agent' },
    });
    const sealed = addIntegrity(converted.transcript, {
      seal: { id: 'seal', time: '2026-10-01T00:02:00.000Z' },
    });
    const validation = validateTranscript(serializeTranscript(sealed));
    const errors = validation.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length)
      throw new Error(
        `seed ${seed}: ${errors.map((d) => `line ${d.line}: ${d.message}`).join('; ')}`,
      );

    // Every agent event is kept in some record's native, in order, once.
    const natives = converted.transcript.records.flatMap((record) =>
      record.native?.format === V6_TRAJECTORY_FORMAT
        ? record.native.records
        : [],
    );
    const agentEvents = events.filter((event) => event.source === 'aut');
    const prompts = natives.filter(
      (event) => (event as { source?: string }).source === 'runner',
    );
    expect(natives.length - prompts.length, `seed ${seed}`).toBe(
      agentEvents.length,
    );
    // Every runner event is a run event, placed at a record that exists (or before any).
    const ids = new Set(
      converted.transcript.records.map((record) => record.id),
    );
    expect(converted.runEvents.length, `seed ${seed}`).toBe(
      events.length - agentEvents.length,
    );
    for (const event of converted.runEvents)
      expect(event.at === null || ids.has(event.at), `seed ${seed}`).toBe(true);
    // Tokens: what 0.10 counted equals uncached tokens plus cache reads.
    const before = agentEvents.reduce(
      (sum, event) =>
        sum +
        (event.kind === 'turn-completed' ? (oldTokens(event.usage) ?? 0) : 0),
      0,
    );
    const after = reportedUsages(converted.transcript).reduce(
      (sum, usage) => sum + uncachedTokens(usage) + (usage.cacheRead ?? 0),
      0,
    );
    expect(after, `seed ${seed}`).toBe(before);
  }
});

test('scoring that names tokens it cannot reproduce is refused', () => {
  const converted = convertTrajectory(
    [
      {
        source: 'aut',
        kind: 'message',
        role: 'assistant',
        content: 'hi',
        timestamp: '2026-10-01T00:00:00.000Z',
      },
      {
        source: 'aut',
        kind: 'turn-completed',
        turn: 1,
        usage: { inputTokens: 10, outputTokens: 5 },
        timestamp: '2026-10-01T00:00:00.000Z',
      },
    ],
    { runId: 'run', startedAt: '2026-10-01T00:00:00.000Z' },
  );
  const scoring = (tokens: number) => ({
    results: [],
    passed: true,
    metrics: [{ name: 'tokens', value: tokens, unit: 'tokens', builtIn: true }],
  });
  expect(
    upgradeScoring(
      scoring(15),
      { runId: 'run', startedAt: '' },
      converted.recordOfEvent,
      converted.transcript,
    ).metrics,
  ).toContainEqual(expect.objectContaining({ name: 'tokens', value: 15 }));
  // Runs before 0.11 had no steps metric; the converted transcript gives it.
  expect(
    upgradeScoring(
      scoring(15),
      { runId: 'run', startedAt: '' },
      converted.recordOfEvent,
      converted.transcript,
    ).metrics,
  ).toContainEqual({ name: 'steps', value: 1, better: 'lower', builtIn: true });
  expect(() =>
    upgradeScoring(
      scoring(99),
      { runId: 'run', startedAt: '' },
      converted.recordOfEvent,
      converted.transcript,
    ),
  ).toThrow();
});
