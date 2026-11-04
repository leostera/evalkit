import { describe, expect, test } from 'bun:test';
import * as Schema from 'effect/Schema';
import {
  JsonValueSchema,
  RunManifestSchema,
  RunScoringSchema,
  RunEventSchema,
  RunSummarySchema,
} from './schema.js';
import { parseRunEventsJsonl } from './run-events.js';
import type { RunEvent } from './index.js';

const runUri = 'evalkit:run:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const runManifest = {
  schemaVersion: 7,
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
const events: RunEvent[] = [
  { kind: 'run-started', timestamp: '2026-01-01T00:00:00Z', at: null },
  {
    kind: 'limit-reached',
    limit: 'steps',
    value: 40,
    used: 41,
    timestamp: '2026-01-01T00:00:03Z',
    at: 'r7',
  },
  {
    kind: 'scorer-completed',
    timestamp: '2026-01-01T00:00:04Z',
    scorer: 'gate',
    value: 0,
    at: 'r7',
  },
  { kind: 'run-completed', timestamp: '2026-01-01T00:00:10Z', at: 'r7' },
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
        schemaVersion: 6,
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

  test("decodes EvalKit's run events, each placed in the transcript by `at`", () => {
    const parsed = parseRunEventsJsonl(
      events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    );
    expect(parsed).toEqual(events);
    for (const event of events)
      expect(Schema.decodeUnknownSync(RunEventSchema)(event)).toEqual(event);
    expect(() =>
      parseRunEventsJsonl(JSON.stringify(events[0]) + '\n{'),
    ).toThrow('line 2');
    // Agent events are not run events any more: they live in the transcript.
    expect(() =>
      parseRunEventsJsonl(
        JSON.stringify({
          kind: 'tool-call',
          id: 'c',
          name: 'ls',
          timestamp: 'x',
          at: null,
        }),
      ),
    ).toThrow('line 1');
  });

  test('a limited run records the limits it ran under', () => {
    expect(
      Schema.decodeUnknownSync(RunManifestSchema)({
        ...runManifest,
        status: 'limited',
        limits: { steps: 40, time: 1_200_000 },
      }).limits,
    ).toEqual({ steps: 40, time: 1_200_000 });
  });
});
