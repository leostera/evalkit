import { describe, expect, test } from 'bun:test';
import {
  agent,
  defineAgent,
  defineEval,
  defineEvalMatrix,
  defineSuite,
  defineConfig,
  defineSandbox,
  defineDataset,
  registerEvals,
  judge,
  choices,
  criteria,
  skip,
  toJson,
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
    // Scenarios from before 0.9 repeated with policy.trials; now `repeat`.
    expect(() =>
      defineEval({
        id: 'old',
        agent: aut,
        policy: { trials: 3 },
        transcript: [],
        scoring: [],
      } as never),
    ).toThrow('policy.trials, which was replaced by repeat: 3');
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

  test('defineSandbox checks its kind, and scenarios name it in the catalog', () => {
    const node = defineSandbox({
      id: 'node',
      kind: 'container',
      dockerfile: './Dockerfile',
      containerOpts: { network: 'fixtures', mounts: ['/opt/tools:/tools'] },
    });
    expect(node).toMatchObject({
      id: 'node',
      kind: 'container',
      dockerfile: './Dockerfile',
      network: 'fixtures',
      env: [],
      mounts: [{ host: '/opt/tools', path: '/tools' }],
      runtime: 'docker',
    });
    expect(() =>
      defineSandbox({ id: 'x', kind: 'container' } as never),
    ).toThrow('exactly one of dockerfile');
    expect(() =>
      defineSandbox({
        id: 'x',
        kind: 'container',
        image: 'node:24',
        containerOpts: { mounts: ['/a:/workspace/b'] },
      }),
    ).toThrow('/workspace');
    const tuned = defineSandbox({
      id: 'tuned',
      kind: 'container',
      image: 'node:24',
      containerOpts: {
        network: 'host',
        runArgs: ['--cpus', '2', '-v', '/tmp/registry:/registry:rw'],
      },
    });
    expect(tuned).toMatchObject({
      network: 'host',
      runArgs: ['--cpus', '2', '-v', '/tmp/registry:/registry:rw'],
    });
    const runArgs = (args: string[]) => () =>
      defineSandbox({
        id: 'x',
        kind: 'container',
        image: 'node:24',
        containerOpts: { runArgs: args },
      });
    expect(runArgs(['--network', 'host'])).toThrow('use network instead');
    expect(runArgs(['--name=mine'])).toThrow('cannot set --name');
    expect(runArgs(['-v', '/a:/workspace'])).toThrow('/workspace');
    expect(runArgs(['--mount=type=bind,src=/a,dst=/evalkit-home/x'])).toThrow(
      '/evalkit-home',
    );
    expect(() => defineSandbox({ id: 'Bad Id', kind: 'host' })).toThrow('id');
    expect(() => defineSandbox({ id: 'r', kind: 'remote' } as never)).toThrow(
      'start(run)',
    );
    expect(() => defineConfig({ sandboxes: { other: node } })).toThrow(
      'name it by its id',
    );
    expect(() =>
      defineConfig({ sandboxes: { node }, sandbox: 'gone' }),
    ).toThrow('not in sandboxes');
    expect(
      registerEvals([
        defineEval({
          id: 'e',
          agent: aut,
          sandbox: node,
          transcript: [],
          scoring: [],
        }),
      ]).catalog()[0]?.sandbox,
    ).toBe('node');
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

  test('preserves declarative evaluation values', () => {
    const definition = defineEval({
      id: 'eval-03',
      agent: aut,
      transcript: [
        user('hello'),
        agent({ contains: ['hello'] }),
        judge('friendly', {
          agent: { ...aut },
          rubric: 'The reply is friendly.',
        }),
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
        transcript: [
          user('hello'),
          judge('friendly', { agent: aut, rubric: 'Is it friendly?' }),
        ],
        scoring: [],
      }),
    ).toThrow('Judge friendly in same-judge uses the agent under test');
  });

  test('a scenario-level judge names where judges moved', () => {
    expect(() =>
      defineEval({
        id: 'old-judge',
        agent: aut,
        judge: { ...aut },
        transcript: [],
        scoring: [],
      } as Parameters<typeof defineEval>[0]),
    ).toThrow('sets judge, which moved to each rule');
  });

  test('judge answers: choices and criteria are checked when defined', () => {
    expect(() => choices({ A: ['only one', 1] })).toThrow('at least two');
    expect(() => choices({ A: ['good', 1], B: ['bad', 2] })).toThrow(
      'from 0 to 1',
    );
    expect(() => criteria({ concise: 0 })).toThrow('positive weight');
    expect(() =>
      judge('x', { rubric: 'r', inputs: { 'Bad Name': () => 1 } }),
    ).toThrow('must start with a lowercase letter');
    expect(() => judge('x', { rubric: 'r', passAt: 2 })).toThrow(
      'passAt must be a number from 0 to 1',
    );
    expect(judge('x', { rubric: 'r' }).answer).toEqual({ kind: 'verdict' });
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
      repeat: 3,
      policy: { failfast: true },
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
    expect(entry?.policy).toEqual({ failfast: true });
    expect(entry?.repeat).toBe(3);
    // Without a root, no paths at all: never absolute ones.
    expect(registerEvals([evaluation]).catalog()[0]?.definedAt).toBeUndefined();
  });
});
