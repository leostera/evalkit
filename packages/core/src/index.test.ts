import { describe, expect, test } from 'bun:test';
import {
  agent,
  defineEval,
  defineEvalMatrix,
  defineSuite,
  directory,
  registerEvals,
  dynamic,
  inlineFile,
  judge,
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
  test('defaults shorthand directory fixtures to their candidate basename', () => {
    expect(directory('../shared-fixtures/starter')).toEqual({
      kind: 'directory',
      src: '../shared-fixtures/starter',
      dst: 'starter',
      visibility: 'candidate',
    });
  });

  test('scopes fixture destinations to each eval without naming fixtures', () => {
    const first = defineEval({
      id: 'first',
      agent: aut,
      fixtures: [
        directory('fixtures/first/original', {
          dst: 'original',
          visibility: 'evaluator',
        }),
      ],
      transcript: [],
      scoring: [],
    });
    const second = defineEval({
      id: 'second',
      agent: aut,
      fixtures: [
        directory('fixtures/second/original', {
          dst: 'original',
          visibility: 'evaluator',
        }),
      ],
      transcript: [],
      scoring: [],
    });
    const catalog = registerEvals([first, second]).catalog();
    expect(catalog.map((entry) => entry.fixtures[0]?.destination)).toEqual([
      'original',
      'original',
    ]);
    expect(catalog[0]?.fixtures[0]).toEqual({
      kind: 'directory',
      source: 'fixtures/first/original',
      destination: 'original',
      visibility: 'evaluator',
    });
  });

  test('preserves declarative evaluation values', () => {
    const definition = defineEval({
      id: 'eval-03',
      agent: aut,
      fixtures: [dynamic(() => inlineFile('input.txt', 'hello', 'candidate'))],
      transcript: [
        user('hello'),
        agent({ contains: ['hello'] }),
        judge('The reply is friendly.'),
      ],
      scoring: [predicate('score', () => 1)],
    });

    expect(definition.id).toBe('eval-03');
    expect(definition.transcript).toHaveLength(3);
    expect(definition.scoring[0]?.kind).toBe('predicate');
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
