import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { predicate, type ScoringContext } from '@evalkit/core';

type Commit = { id: string; text: string; version: string };

async function commits({ artifacts }: ScoringContext): Promise<Commit[]> {
  const raw = await readFile(
    join(artifacts.candidate.root, 'notes.json'),
    'utf8',
  ).catch(() => '{"commits": []}');
  return (JSON.parse(raw) as { commits: Commit[] }).commits;
}

/**
 * The checks of a versioned-notes build, each a predicate that returns what
 * it saw as evidence, so a failure shows why.
 */
export const builds = predicate(
  'builds',
  async (scoring) => ({ value: (await commits(scoring)).length ? 1 : 0 }),
  { description: 'The service wrote its store, notes.json' },
);

export const saves = predicate(
  'saves',
  async (scoring) => {
    const all = await commits(scoring);
    return {
      value: all.every((commit) => commit.version) ? 1 : 0,
      evidence: all.map(({ id, version }) => ({ id, version })),
    };
  },
  { description: 'Every save answers with a version' },
);

export const history = predicate(
  'history',
  async (scoring) => {
    const entries = (await commits(scoring))
      .filter((commit) => commit.id === 'a')
      .reverse()
      .map(({ version, text }) => ({ version, text }));
    const expected = ['final text', 'second draft', 'first draft'];
    const right =
      entries.map((entry) => entry.text).join('|') === expected.join('|');
    return {
      value: right ? 1 : 0,
      ...(right
        ? {}
        : {
            explanation: `Got ${entries.length} history entries for a, expected ${expected.length}.`,
          }),
      evidence: entries,
    };
  },
  {
    description:
      "a's history lists its 3 saves, newest first, with their versions",
  },
);

export const oneCommitPerSave = predicate(
  'one commit per save',
  async (scoring) => {
    const versions = (await commits(scoring)).map((commit) => commit.version);
    return {
      value: new Set(versions).size === 4 ? 1 : 0,
      evidence: { versions },
    };
  },
  { description: 'Each of the 4 saves is its own commit' },
);
