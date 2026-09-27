import { describe, expect, test } from 'bun:test';
import * as Schema from 'effect/Schema';
import {
  JsonValueSchema,
  RunManifestSchema,
  RunSummarySchema,
  TrialManifestSchema,
  TrialScoringSchema,
  TrialSummarySchema,
  TrajectoryEventSchema,
} from './schema.js';
import { parseTrajectoryJsonl } from './trajectory.js';
import type { TrajectoryEvent } from './index.js';

const runUri = 'evalkit:run:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const trialUri = 'evalkit:trial:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const runManifest = {
  schemaVersion: 2,
  runUri,
  evalId: 'cron-trigger',
  startedAt: '2026-01-01T00:00:00Z',
  aut: { id: 'cf-build-agent', kind: 'cloudflare-agent' },
  parameters: { model: 'glm-flash', mode: 'with-docs', turnBudget: 6 },
  matrix: { id: 'benchmark', cellKey: 'one-cell' },
  status: 'running',
};
const trialManifest = {
  ...runManifest,
  trialUri,
  trialIndex: 0,
};
const trialSummary = {
  status: 'completed',
  endedAt: '2026-01-01T00:00:10Z',
  durationMs: 10000,
  scoring: {
    results: [
      {
        name: 'original deterministic gate',
        kind: 'predicate',
        durationMs: 25,
        value: 0,
        passed: false,
        evidence: {
          pass: false,
          checks: {
            compiles: true,
            typechecks: false,
            testsPass: true,
            bindingsOk: true,
          },
        },
      },
    ],
    overall: 0,
    passed: false,
  },
  artifacts: [{ path: 'candidate/src/index.ts', kind: 'file', size: 100 }],
};
const events: TrajectoryEvent[] = [
  {
    source: 'runner',
    kind: 'trial-started',
    timestamp: '2026-01-01T00:00:00Z',
  },
  {
    source: 'aut',
    kind: 'turn-completed',
    timestamp: '2026-01-01T00:00:01Z',
    turn: 1,
    latencyMs: 17,
    usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
  },
  {
    source: 'aut',
    kind: 'tool-call',
    timestamp: '2026-01-01T00:00:02Z',
    id: 'call-1',
    name: 'write_file',
    arguments: { path: 'src/index.ts', contents: 'export default {}' },
  },
  {
    source: 'aut',
    kind: 'completed',
    timestamp: '2026-01-01T00:00:03Z',
    output: {
      configuration: { model: { id: 'test/model' } },
      agent: { messages: [] },
    },
  },
  {
    source: 'runner',
    kind: 'scorer-completed',
    timestamp: '2026-01-01T00:00:04Z',
    scorer: 'gate',
    value: 0,
  },
  {
    source: 'runner',
    kind: 'trial-completed',
    timestamp: '2026-01-01T00:00:10Z',
  },
];

describe('provider-neutral persisted report contract', () => {
  test('decodes manifests and finalized summaries independently (including pre-fix running manifests)', () => {
    expect(
      Schema.decodeUnknownSync(RunManifestSchema)(runManifest).status,
    ).toBe('running');
    expect(
      Schema.decodeUnknownSync(RunSummarySchema)({
        status: 'completed',
        endedAt: trialSummary.endedAt,
        trialCount: 1,
        passed: 0,
        failed: 1,
      }).status,
    ).toBe('completed');
    expect(
      Schema.decodeUnknownSync(TrialManifestSchema)(trialManifest).parameters
        ?.mode,
    ).toBe('with-docs');
    expect(
      Schema.decodeUnknownSync(TrialSummarySchema)(trialSummary).scoring
        ?.results[0]?.evidence,
    ).toEqual(trialSummary.scoring.results[0]?.evidence);
    expect(
      Schema.decodeUnknownSync(RunManifestSchema)({
        ...runManifest,
        status: undefined,
      }).status,
    ).toBeUndefined();
  });

  test('validates scorer evidence as generic JSON, not a provider-specific gate', () => {
    expect(
      Schema.decodeUnknownSync(TrialScoringSchema)(trialSummary.scoring).passed,
    ).toBe(false);
    expect(() => Schema.decodeUnknownSync(JsonValueSchema)(1n)).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(TrialSummarySchema)({
        ...trialSummary,
        scoring: {
          ...trialSummary.scoring,
          results: [{ ...trialSummary.scoring.results[0], evidence: () => 1 }],
        },
      }),
    ).toThrow();
  });

  test('decodes both AUT and runner JSONL events without discarding generic output', () => {
    const parsed = parseTrajectoryJsonl(
      events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    );
    expect(parsed).toHaveLength(events.length);
    expect(parsed[3]).toEqual(events[3]);
    for (const event of events)
      expect(Schema.decodeUnknownSync(TrajectoryEventSchema)(event)).toEqual(
        event,
      );
    expect(() =>
      parseTrajectoryJsonl(JSON.stringify(events[0]) + '\n{'),
    ).toThrow('line 2');
    expect(() =>
      parseTrajectoryJsonl(
        JSON.stringify(events[0]) + '\n{"source":"aut","kind":"nope"}',
      ),
    ).toThrow('line 2');
  });
});
