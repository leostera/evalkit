import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CatalogEval,
  DashboardApi,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { filterRuns, runParameterColumns, RunTable } from './RunTable.js';

const catalog: CatalogEval[] = [
  {
    id: 'greeting',
    name: 'Greeting',
    path: 'greeting',
    trialCount: 1,
    agent: { kind: 'in-process', name: 'Greeter', runtimes: [] },
    fixtures: [],
    scorers: [],
  },
];
const suites: SuiteSummary[] = [
  { id: 'starter', name: 'Starter', evalIds: ['greeting'] },
];
const runs: RunSummary[] = [
  {
    id: 'run-one',
    evalId: 'greeting',
    suiteId: 'starter',
    matrixId: 'styles',
    parameters: { model: 'scout', retries: 2, options: { docs: true } },
    status: 'passed',
    startedAt: '2026-01-01T00:00:00Z',
    completedTrials: 1,
    requestedTrials: 1,
    score: 1,
  },
  {
    id: 'run-two',
    evalId: 'greeting',
    matrixId: 'styles',
    parameters: { model: 'glm', enabled: false },
    status: 'failed',
    startedAt: '2026-01-02T00:00:00Z',
    completedTrials: 1,
    requestedTrials: 1,
    score: 0,
  },
  {
    id: 'run-three',
    evalId: 'greeting',
    status: 'running',
    startedAt: '2026-01-03T00:00:00Z',
    completedTrials: 0,
    requestedTrials: 1,
  },
];

test('runs show a stable union of saved parameter keys, including overrides', () => {
  expect(runParameterColumns(runs)).toEqual([
    'enabled',
    'model',
    'options',
    'retries',
  ]);
  expect(runParameterColumns([runs[2]!])).toEqual([]);
  const html = renderToStaticMarkup(
    <RunTable
      api={{} as DashboardApi}
      runs={runs}
      suites={suites}
      catalog={catalog}
      onTrial={() => {}}
      onOpenRun={() => {}}
      selectedRunId="run-one"
    />,
  );
  for (const key of runParameterColumns(runs))
    expect(html).toContain(`class="table-sort">${key} ↕</button>`);
  expect(html).toContain('aria-label="Filter runs"');
  expect(html).toContain('{&quot;docs&quot;:true}');
  expect(html).toContain('false');
  expect(html).toContain('colSpan="13"');
});

test('large run histories render one page without losing the full count', () => {
  const many = Array.from({ length: 120 }, (_, index) => ({
    ...runs[0]!,
    id: `run-${index}`,
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));
  const html = renderToStaticMarkup(
    <RunTable
      api={{} as DashboardApi}
      runs={many}
      suites={suites}
      catalog={catalog}
      onTrial={() => {}}
      onOpenRun={() => {}}
    />,
  );
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(50);
  expect(html).toContain('1–50 of 120');
  expect(html).toContain('50 of 120');
  expect(html).toContain('aria-sort="descending"');
});

test('saved parameter facets and URL filters keep historical runs from different matrix states', () => {
  const search = new URLSearchParams();
  search.append('p.model', '"scout"');
  const html = renderToStaticMarkup(
    <RunTable
      api={{} as DashboardApi}
      runs={runs}
      suites={suites}
      catalog={catalog}
      search={search}
      onSearchChange={() => {}}
      onTrial={() => {}}
      onOpenRun={() => {}}
    />,
  );
  expect(html).toContain('Filters (1 active)');
  expect(html).toContain('1 of 3 runs');
  expect(html).toContain('run-one');
  expect(html).not.toContain('run-two');
  expect(html).toContain('Missing');
});

test('filters runs across the complete list by names, status and parameter keys and values', () => {
  expect(
    filterRuns(runs, 'starter scout', suites, catalog).map((run) => run.id),
  ).toEqual(['run-one']);
  expect(
    filterRuns(runs, 'options docs":true', suites, catalog).map(
      (run) => run.id,
    ),
  ).toEqual(['run-one']);
  expect(
    filterRuns(runs, 'enabled false', suites, catalog).map((run) => run.id),
  ).toEqual(['run-two']);
  expect(
    filterRuns(runs, 'running', suites, catalog).map((run) => run.id),
  ).toEqual(['run-three']);
  expect(filterRuns(runs, 'unknown', suites, catalog)).toEqual([]);
  expect(filterRuns(runs, '   ', suites, catalog)).toHaveLength(3);
});
