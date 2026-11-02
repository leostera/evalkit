import { describe, expect, test } from 'bun:test';
import * as Schema from 'effect/Schema';
import {
  JsonValueSchema,
  RunManifestSchema,
  RunScoringSchema,
  RunSummarySchema,
  TrajectoryEventSchema,
} from './schema.js';
import { parseTrajectoryJsonl } from './trajectory.js';
import type { TrajectoryEvent } from './index.js';

const runUri = 'evalkit:run:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const runManifest = {
  schemaVersion: 6,
  runUri,
  evalId: 'cron-trigger',
  startedAt: '2026-01-01T00:00:00Z',
  aut: { id: 'build-agent', kind: 'remote-agent' },
  parameters: { model: 'glm-flash', mode: 'with-docs', turnBudget: 6 },
  matrix: { id: 'benchmark', cellKey: 'one-cell' },
  batch: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', index: 1, size: 3 },
  status: 'running',
};
const runSummary = {
  status: 'failed',
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
    kind: 'run-started',
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
    kind: 'run-completed',
    timestamp: '2026-01-01T00:00:10Z',
  },
];

describe('provider-neutral persisted report contract', () => {
  test('decodes manifests and finalized summaries independently', () => {
    const manifest = Schema.decodeUnknownSync(RunManifestSchema)(runManifest);
    expect(manifest.status).toBe('running');
    expect(manifest.parameters?.mode).toBe('with-docs');
    expect(manifest.batch).toEqual(runManifest.batch);
    expect(
      Schema.decodeUnknownSync(RunSummarySchema)(runSummary).scoring?.results[0]
        ?.evidence,
    ).toEqual(runSummary.scoring.results[0]?.evidence);
    expect(
      Schema.decodeUnknownSync(RunManifestSchema)({
        ...runManifest,
        status: undefined,
      }).status,
    ).toBeUndefined();
  });

  test('older report versions are not read: they go through evalkit upgrade', () => {
    expect(() =>
      Schema.decodeUnknownSync(RunManifestSchema)({
        ...runManifest,
        schemaVersion: 5,
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(RunSummarySchema)({
        ...runSummary,
        status: 'completed',
      }),
    ).toThrow();
  });

  test('validates scorer evidence as generic JSON, not a provider-specific gate', () => {
    expect(
      Schema.decodeUnknownSync(RunScoringSchema)(runSummary.scoring).passed,
    ).toBe(false);
    expect(() => Schema.decodeUnknownSync(JsonValueSchema)(1n)).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(RunSummarySchema)({
        ...runSummary,
        scoring: {
          ...runSummary.scoring,
          results: [{ ...runSummary.scoring.results[0], evidence: () => 1 }],
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
