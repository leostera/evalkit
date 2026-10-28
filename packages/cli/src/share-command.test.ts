import { expect, test } from 'bun:test';
import type { RunSource } from '@evalkit/core';
import type { LocalRun } from './dashboard-reports.js';
import { selectRuns } from './share-command.js';

const head: RunSource = {
  repo: 'gitlab.example.com/team/evals',
  project: '',
  commit: 'a'.repeat(40),
  dirty: false,
};
const run = (id: string, extra: Partial<LocalRun> = {}): LocalRun => ({
  id,
  evalId: 'greeting',
  status: 'passed',
  startedAt: '2026-10-28T00:00:00Z',
  completedTrials: 1,
  requestedTrials: 1,
  source: head,
  ...extra,
});

test('share selects committed, current, unarchived runs at HEAD', () => {
  const runs = [
    run('head'),
    run('untracked', { source: undefined }),
    run('older', { source: { ...head, commit: 'b'.repeat(40) } }),
    run('other-project', { source: { ...head, project: 'other' } }),
    run('dirty', { source: { ...head, dirty: true } }),
    run('archived', { archived: true }),
  ];
  const selection = selectRuns(runs, head, {});
  expect(selection.selected.map((entry) => entry.id)).toEqual(['head']);
  expect(selection).toMatchObject({
    untracked: 1,
    otherCommits: 2,
    dirty: 1,
    archived: 1,
  });
  expect(
    selectRuns(runs, head, { all: true, allowDirty: true }).selected.map(
      (entry) => entry.id,
    ),
  ).toEqual(['head', 'older', 'other-project', 'dirty']);
});
