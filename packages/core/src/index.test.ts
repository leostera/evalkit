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
    expect(
      directory(
        'evalkit:fixture:0197f17c-4d89-7f81-9d42-6c497e6f6b14',
        '../shared-fixtures/starter',
      ),
    ).toEqual({
      kind: 'directory',
      uri: 'evalkit:fixture:0197f17c-4d89-7f81-9d42-6c497e6f6b14',
      src: '../shared-fixtures/starter',
      dst: 'starter',
      visibility: 'candidate',
    });
  });

  test('preserves declarative evaluation values', () => {
    const definition = defineEval({
      uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b03',
      agent: aut,
      fixtures: [
        dynamic('evalkit:fixture:0197f17c-4d89-7f81-9d42-6c497e6f6b15', () =>
          inlineFile(
            'evalkit:fixture:0197f17c-4d89-7f81-9d42-6c497e6f6b16',
            'input.txt',
            'hello',
            'candidate',
          ),
        ),
      ],
      transcript: [
        user('hello'),
        agent({ contains: ['hello'] }),
        judge('The reply is friendly.'),
      ],
      scoring: [predicate('score', () => 1)],
    });

    expect(definition.uri).toBe(
      'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b03',
    );
    expect(definition.transcript).toHaveLength(3);
    expect(definition.scoring[0]?.kind).toBe('predicate');
  });

  test('builds an explicit eval registry', () => {
    const evaluation = defineEval({
      uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b04',
      name: 'Registered eval',
      agent: aut,
      transcript: [],
      scoring: [],
    });
    const registry = registerEvals([evaluation]);

    expect(
      registry.get('evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b04'),
    ).toBe(evaluation);
    expect(registry.metadata()).toEqual([
      {
        uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b04',
        uuid: '0197f17c-4d89-7f81-9d42-6c497e6f6b04',
        name: 'Registered eval',
      },
    ]);
  });

  test('flattens suites and preserves suite membership', () => {
    const evaluation = defineEval({
      uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b05',
      agent: aut,
      transcript: [],
      scoring: [],
    });
    const registry = registerEvals([
      defineSuite({
        uri: 'evalkit:suite:0197f17c-4d89-7f81-9d42-6c497e6f6b17',
        name: 'Shipwright journeys',
        evals: [evaluation],
      }),
    ]);

    expect(
      registry.get('evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b05'),
    ).toBe(evaluation);
    expect(registry.suiteMetadata()).toEqual([
      {
        uri: 'evalkit:suite:0197f17c-4d89-7f81-9d42-6c497e6f6b17',
        uuid: '0197f17c-4d89-7f81-9d42-6c497e6f6b17',
        name: 'Shipwright journeys',
        evalUris: ['evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b05'],
      },
    ]);
    expect(registry.metadata()).toEqual([
      {
        uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b05',
        uuid: '0197f17c-4d89-7f81-9d42-6c497e6f6b05',
        suiteUri: 'evalkit:suite:0197f17c-4d89-7f81-9d42-6c497e6f6b17',
      },
    ]);
  });

  test('rejects duplicate registry IDs', () => {
    const evaluation = defineEval({
      uri: 'evalkit:eval:0197f17c-4d89-7f81-9d42-6c497e6f6b06',
      agent: aut,
      transcript: [],
      scoring: [],
    });

    expect(() => registerEvals([evaluation, { ...evaluation }])).toThrow(
      'duplicate eval URI',
    );
  });
});
