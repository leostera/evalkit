import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { predicate, type ScoringContext } from '@evalkit/core';

type Commit = { id: string; text: string; version: string };

async function readStore({ artifacts }: ScoringContext): Promise<Commit[]> {
  const raw = await readFile(
    join(artifacts.candidate.root, 'notes.json'),
    'utf8',
  );
  return (JSON.parse(raw) as { commits: Commit[] }).commits;
}

/** The checkpoint after the build: the service wrote its store at all. */
export const builds = predicate(
  'builds',
  async (scoring) => {
    try {
      return (await readStore(scoring)).length > 0;
    } catch {
      return { value: 0, explanation: 'notes.json was not written' };
    }
  },
  { description: 'The service wrote its store, notes.json' },
);

/**
 * One exercise, several verdicts: read the store once, then judge each
 * check against it. Each criterion carries what it saw as evidence. When
 * the store cannot be read, no check is reached, and the explanation says
 * why once. What it read is attached, next to the verdict.
 */
export const notesService = predicate(
  'notes service',
  async (scoring) => {
    let commits: Commit[];
    try {
      commits = await readStore(scoring);
    } catch (error) {
      // Every declared check left out is recorded as not reached.
      return {
        criteria: [],
        explanation: `Could not read notes.json: ${(error as Error).message}`,
      };
    }
    await scoring.attach(
      'logs/notes-store.json',
      JSON.stringify({ commits }, null, 2),
    );
    const history = commits
      .filter((commit) => commit.id === 'a')
      .reverse()
      .map(({ version, text }) => ({ version, text }));
    const expected = ['final text', 'second draft', 'first draft'];
    const versions = commits.map((commit) => commit.version);
    return {
      criteria: [
        {
          name: 'saves',
          value: commits.every((commit) => commit.version) ? 1 : 0,
          evidence: commits.map(({ id, version }) => ({ id, version })),
        },
        {
          name: 'history',
          value:
            history.map((entry) => entry.text).join('|') === expected.join('|')
              ? 1
              : 0,
          explanation: `${history.length} entries for a, expected ${expected.length}`,
          evidence: history,
        },
        {
          name: 'one commit per save',
          value: new Set(versions).size === 4 ? 1 : 0,
          explanation: `${new Set(versions).size} distinct versions for 4 saves`,
          evidence: { versions },
        },
      ],
    };
  },
  {
    description: 'Saves, history and commits of a versioned notes service',
    criteria: {
      saves: 'every save answers with a version',
      history: "a's history lists its 3 saves, newest first",
      'one commit per save': 'each of the 4 saves is its own commit',
    },
  },
);
