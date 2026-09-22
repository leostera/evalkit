import { describe, expect, test } from 'bun:test';
import {
  agent,
  defineEval,
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

  test('preserves declarative evaluation values', () => {
    const definition = defineEval({
      id: 'smoke',
      agent: aut,
      fixtures: [dynamic(() => inlineFile('input.txt', 'hello', 'candidate'))],
      transcript: [
        user('hello'),
        agent({ contains: ['hello'] }),
        judge('The reply is friendly.'),
      ],
      scoring: [predicate('score', () => 1)],
    });

    expect(definition.id).toBe('smoke');
    expect(definition.transcript).toHaveLength(3);
    expect(definition.scoring[0]?.kind).toBe('predicate');
  });

  test('builds an explicit eval registry', () => {
    const evaluation = defineEval({
      id: 'registered',
      name: 'Registered eval',
      agent: aut,
      transcript: [],
      scoring: [],
    });
    const registry = registerEvals([evaluation]);

    expect(registry.get('registered')).toBe(evaluation);
    expect(registry.metadata()).toEqual([
      { id: 'registered', name: 'Registered eval' },
    ]);
  });

  test('flattens suites and preserves suite membership', () => {
    const evaluation = defineEval({
      id: 'ship-repair',
      agent: aut,
      transcript: [],
      scoring: [],
    });
    const registry = registerEvals([
      defineSuite({
        id: 'grand-line.shipwright',
        name: 'Shipwright journeys',
        evals: [evaluation],
      }),
    ]);

    expect(registry.get('ship-repair')).toBe(evaluation);
    expect(registry.suiteMetadata()).toEqual([
      {
        id: 'grand-line.shipwright',
        name: 'Shipwright journeys',
        evalIds: ['ship-repair'],
      },
    ]);
    expect(registry.metadata()).toEqual([
      {
        id: 'ship-repair',
        suiteId: 'grand-line.shipwright',
      },
    ]);
  });

  test('rejects duplicate registry IDs', () => {
    const evaluation = defineEval({
      id: 'duplicate',
      agent: aut,
      transcript: [],
      scoring: [],
    });

    expect(() => registerEvals([evaluation, { ...evaluation }])).toThrow(
      'duplicate id',
    );
  });
});
