import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { SuiteTable } from './SuiteTable.js';

const standalone: CatalogEval = {
  id: 'echo',
  name: 'Echo Worker',
  path: 'echo',
  trialCount: 1,
  agent: { kind: 'worker', runtimes: [{ name: 'local', kind: 'bun' }] },
  fixtures: [],
  scorers: [],
};

function render(
  suites: SuiteSummary[],
  catalog: CatalogEval[],
  runs: RunSummary[] = [],
): string {
  return renderToStaticMarkup(
    <SuiteTable
      api={{} as DashboardApi}
      suites={suites}
      catalog={catalog}
      runs={runs}
      onOpenSuite={() => {}}
      onOpenEval={() => {}}
    />,
  );
}

test('discovered evals are visible without a suite', () => {
  const html = render([], [standalone]);
  expect(html).toContain('Standalone evals');
  expect(html).toContain('Echo Worker');
  expect(html).toContain('Run eval');
  expect(html).not.toContain('No suites are loaded');
});

test('standalone evals remain visible alongside suites without duplicating suite members', () => {
  const html = render(
    [{ id: 'starter', name: 'Starter', evalIds: ['greeting'] }],
    [
      {
        ...standalone,
        id: 'greeting',
        name: 'Greeting',
        path: 'starter#greeting',
        suiteId: 'starter',
      },
      standalone,
    ],
  );
  expect(html).toContain('Starter');
  expect(html).toContain('Standalone evals');
  expect(html).toContain('Echo Worker');
  expect(html).not.toContain('Greeting'); // suite members are only shown when expanded
});

test('a standalone eval shows the latest run status', () => {
  const html = render(
    [],
    [standalone],
    [
      {
        id: 'new-run',
        evalId: 'echo',
        status: 'running',
        startedAt: '2026-01-02T00:00:00Z',
        completedTrials: 0,
        requestedTrials: 1,
      },
      {
        id: 'old-run',
        evalId: 'echo',
        status: 'passed',
        startedAt: '2026-01-01T00:00:00Z',
        completedTrials: 1,
        requestedTrials: 1,
      },
    ],
  );
  expect(html).toContain('class="status running"');
  expect(html).not.toContain('class="status passed"');
});

test('empty state is shown only when there are no evals and no suites', () => {
  expect(render([], [])).toContain('No evals or suites are loaded.');
});
