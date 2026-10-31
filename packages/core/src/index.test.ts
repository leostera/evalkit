import { describe, expect, test } from 'bun:test';
import {
  agent,
  defineAgent,
  defineEval,
  defineEvalMatrix,
  defineSuite,
  agentRuntimes,
  defineDataset,
  registerEvals,
  judge,
  skip,
  toJson,
  turnResultEvents,
  predicate,
  user,
} from './index';

const aut = {
  async start() {
    return {
      async send() {},
      async close() {},
    };
  },
};

describe('core definitions', () => {
  test('defaults dataset visibility to candidate and mount to its ID', () => {
    expect(
      defineDataset({ id: 'help-center', files: 'datasets/help' }),
    ).toEqual({
      kind: 'dataset',
      id: 'help-center',
      visibility: 'candidate',
      mount: 'help-center',
      source: { kind: 'static', files: 'datasets/help' },
    });
    expect(
      defineDataset({ id: 'root', mount: './', value: { a: 1 } }).mount,
    ).toBe('.');
  });

  test('rejects empty, conflicting and escaping datasets', () => {
    expect(() => defineDataset({ id: 'empty' })).toThrow('is empty');
    expect(() =>
      defineDataset({ id: 'both', value: 1, valueFile: 'x.json' }),
    ).toThrow('both value and valueFile');
    expect(() =>
      defineDataset({
        id: 'mixed',
        onLoad: () => ({}),
        files: 'x',
      } as never),
    ).toThrow('is computed');
    expect(() =>
      defineDataset({ id: 'escape', mount: '../out', value: 1 }),
    ).toThrow('escapes');
    expect(() => defineDataset({ id: 'Bad Id', value: 1 })).toThrow(
      'kebab-case',
    );
  });

  test('lists datasets in the catalog and rejects duplicates and fixtures', () => {
    const answers = defineDataset({
      id: 'answers',
      visibility: 'evaluator',
      value: { a: 1 },
    });
    const accounts = defineDataset({ id: 'accounts', onLoad: () => ({}) });
    const evaluation = defineEval({
      id: 'first',
      agent: aut,
      datasets: [answers, accounts],
      transcript: [],
      scoring: [],
    });
    expect(registerEvals([evaluation]).catalog()[0]?.datasets).toEqual([
      {
        id: 'answers',
        visibility: 'evaluator',
        source: 'static',
        mount: 'answers',
        // The shape only: dataset values never reach the catalog.
        value: { shape: { type: 'object', keys: ['a'] } },
      },
      {
        id: 'accounts',
        visibility: 'candidate',
        source: 'computed',
        mount: 'accounts',
        hooks: { onLoad: true, onRun: false },
      },
    ]);
    expect(() =>
      defineEval({
        id: 'twice',
        agent: aut,
        datasets: [answers, answers],
        transcript: [],
        scoring: [],
      }),
    ).toThrow('more than once');
    expect(() =>
      defineEval({
        id: 'raw',
        agent: aut,
        datasets: [{ id: 'raw' } as never],
        transcript: [],
        scoring: [],
      }),
    ).toThrow('defineDataset');
    expect(() =>
      defineEval({
        id: 'old',
        agent: aut,
        fixtures: [],
        transcript: [],
        scoring: [],
      } as never),
    ).toThrow('replaced by datasets');
  });

  test('checks metadata is JSON when the eval is defined', () => {
    expect(() =>
      defineEval({
        id: 'big',
        agent: aut,
        metadata: { size: 1n },
        transcript: [],
        scoring: [],
      }),
    ).toThrow('big.metadata.size: bigint is not JSON');
  });

  test('validates predicate pass thresholds and skip reasons', () => {
    expect(predicate('p', () => 1, { passAt: 0.5 }).passAt).toBe(0.5);
    expect(() => predicate('p', () => 1, { passAt: 2 })).toThrow('0 to 1');
    expect(skip('not applicable')).toEqual({
      skipped: true,
      reason: 'not applicable',
    });
    expect(() => skip(' ')).toThrow('reason');
  });

  test('defaults agent runtimes to local in-process', () => {
    expect(agentRuntimes(aut)).toEqual({ local: { kind: 'in-process' } });
    expect(
      registerEvals([
        defineEval({ id: 'e', agent: aut, transcript: [], scoring: [] }),
      ]).catalog()[0]?.agent.runtimes,
    ).toEqual([{ name: 'local', kind: 'in-process' }]);
  });

  test('converts plain values to JSON with paths in errors', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(
      toJson({ when: date, gone: undefined, list: [1, undefined] }),
    ).toEqual({ when: '2026-01-02T03:04:05.000Z', list: [1, null] });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => toJson(cycle, 'row')).toThrow('row.self: cycle is not JSON');
    expect(() => toJson({ n: Number.NaN })).toThrow('value.n: NaN is not JSON');
    expect(() => toJson({ f: () => 1 })).toThrow('function is not JSON');
  });

  test('records returned turn results as events', () => {
    const now = () => new Date('2026-01-01T00:00:00.000Z');
    expect(
      turnResultEvents(
        {
          reply: { text: 'done' },
          toolCalls: [{ name: 'lookup', arguments: { id: 1 }, result: 'ok' }],
          usage: { totalTokens: 3 },
        },
        2,
        now,
      ).map((event) => event.kind),
    ).toEqual(['tool-call', 'tool-result', 'message', 'turn-completed']);
    expect(turnResultEvents('hi', 1, now)).toEqual([
      {
        kind: 'message',
        role: 'assistant',
        content: 'hi',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  test('preserves declarative evaluation values', () => {
    const definition = defineEval({
      id: 'eval-03',
      agent: aut,
      judge: { ...aut },
      transcript: [
        user('hello'),
        agent({ contains: ['hello'] }),
        judge('friendly', { rubric: 'The reply is friendly.' }),
      ],
      scoring: [predicate('score', () => 1)],
    });

    expect(definition.id).toBe('eval-03');
    expect(definition.transcript).toHaveLength(3);
    expect(definition.scoring[0]?.kind).toBe('predicate');
  });

  test('does not reuse the AUT adapter as a judge', () => {
    expect(() =>
      defineEval({
        id: 'same-judge',
        agent: aut,
        judge: aut,
        transcript: [
          user('hello'),
          judge('friendly', { rubric: 'Is it friendly?' }),
        ],
        scoring: [],
      }),
    ).toThrow('Judge agent must be distinct');
  });

  test('builds an explicit eval registry', () => {
    const evaluation = defineEval({
      id: 'eval-04',
      name: 'Registered eval',
      agent: aut,
      transcript: [],
      scoring: [],
    });
    const registry = registerEvals([evaluation]);

    expect(registry.get('eval-04')).toBe(evaluation);
    expect(registry.metadata()).toEqual([
      {
        id: 'eval-04',
        name: 'Registered eval',
      },
    ]);
  });

  test('flattens suites and preserves suite membership', () => {
    const evaluation = defineEval({
      id: 'eval-05',
      agent: aut,
      transcript: [],
      scoring: [],
    });
    const registry = registerEvals([
      defineSuite({
        id: 'suite-17',
        name: 'Shipwright journeys',
        evals: [evaluation],
      }),
    ]);

    expect(registry.get('eval-05')).toBe(evaluation);
    expect(registry.getSuite('suite-17')?.evals).toEqual([evaluation]);
    expect(registry.suiteMetadata()).toEqual([
      {
        id: 'suite-17',
        name: 'Shipwright journeys',
        evalIds: ['eval-05'],
      },
    ]);
    expect(registry.metadata()).toEqual([
      {
        id: 'eval-05',
        suiteId: 'suite-17',
      },
    ]);
  });

  test('expands eval matrices lazily into parameterized cells', () => {
    const first = defineEval({
      id: 'eval-11',
      agent: {
        start: async () => ({ send: async () => {}, close: async () => {} }),
      },
      transcript: [],
      scoring: [],
    });
    const second = defineEval({
      id: 'eval-12',
      agent: first.agent,
      transcript: [],
      scoring: [],
    });
    const matrix = defineEvalMatrix({
      id: 'matrix-13',
      evals: [first, second],
      parameters: { model: ['a', 'b'], mode: ['without-docs', 'with-docs'] },
    });
    expect(matrix.count()).toBe(8);
    expect([...matrix.cells()]).toHaveLength(8);
    expect(matrix.cells().next().value).toMatchObject({
      eval: first,
      parameters: { model: 'a', mode: 'without-docs' },
    });
  });

  test('validates human-defined IDs', () => {
    expect(() =>
      defineEval({ id: 'Bad ID', agent: aut, transcript: [], scoring: [] }),
    ).toThrow('lowercase kebab-case');
    expect(() =>
      defineEval({
        id: 'good',
        uri: 'old',
        agent: aut,
        transcript: [],
        scoring: [],
      }),
    ).toThrow('use id');
  });

  test('rejects duplicate registry IDs', () => {
    const evaluation = defineEval({
      id: 'eval-06',
      agent: aut,
      transcript: [],
      scoring: [],
    });

    expect(() => registerEvals([evaluation, { ...evaluation }])).toThrow(
      'duplicate eval ID',
    );
  });
});

describe('library catalog', () => {
  test('records where things are defined, relative to the root, and the transcript', () => {
    const greeter = defineAgent({
      identity: { id: 'greeter', kind: 'test' },
      async start() {
        return { async send() {} };
      },
    });
    const says = predicate('says hi', () => 1, { passAt: 0.5 });
    const evaluation = defineEval({
      id: 'greets',
      agent: greeter,
      transcript: [user('hi'), says, user(({ seed }) => `again ${seed}`)],
      scoring: [says],
      policy: { trials: 3, failfast: true },
    });
    const root = new URL('.', import.meta.url).pathname;
    const [entry] = registerEvals([evaluation]).catalog({ root });
    expect(entry?.definedAt).toMatch(/^index\.test\.ts:\d+$/);
    expect(entry?.agent.definedAt).toMatch(/^index\.test\.ts:\d+$/);
    expect(entry?.scorers).toEqual([
      expect.objectContaining({
        name: 'says hi',
        kind: 'predicate',
        passAt: 0.5,
      }),
    ]);
    expect(entry?.transcript).toEqual([
      { kind: 'user', message: 'hi' },
      {
        kind: 'checkpoint',
        scorer: expect.objectContaining({ name: 'says hi' }),
      },
      // A computed message has no fixed text to show.
      { kind: 'user' },
    ]);
    expect(entry?.policy).toEqual({ trials: 3, failfast: true });
    // Without a root, no paths at all: never absolute ones.
    expect(registerEvals([evaluation]).catalog()[0]?.definedAt).toBeUndefined();
  });
});
