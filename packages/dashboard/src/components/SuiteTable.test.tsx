import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
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
  matrix?: MatrixSummary | null,
  selectedSuiteId?: string,
): string {
  return renderToStaticMarkup(
    <SuiteTable
      api={{} as DashboardApi}
      suites={suites}
      catalog={catalog}
      runs={runs}
      matrix={matrix}
      selectedSuiteId={selectedSuiteId}
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

test('matrix cells are rows with a column per axis and no filter selects', () => {
  const matrix = {
    id: 'benchmark',
    parameters: {
      model: ['glm', 'scout'],
      mode: ['with-docs', 'without-docs'],
    },
    trials: 3,
  };
  const runs: RunSummary[] = [
    {
      id: 'first',
      evalId: 'echo',
      matrixId: 'benchmark',
      parameters: { model: 'glm', mode: 'with-docs', turnBudget: 6 },
      status: 'passed',
      startedAt: '2026-01-01',
      completedTrials: 3,
      requestedTrials: 3,
    },
    {
      id: 'second',
      evalId: 'echo',
      matrixId: 'benchmark',
      parameters: { model: 'scout', mode: 'without-docs' },
      status: 'failed',
      startedAt: '2026-01-02',
      completedTrials: 3,
      requestedTrials: 3,
    },
  ];
  const html = render([], [standalone], runs, matrix);
  expect(html).toContain('class="table-sort">model ↕</button>');
  expect(html).toContain('class="table-sort">mode ↕</button>');
  expect(html).toContain('aria-label="Filter matrix cells"');
  expect(html).not.toContain('<select');
  expect(html.match(/Run eval/g)).toHaveLength(4);
  expect(html).toContain('with-docs');
  expect(html).toContain('without-docs');
  expect(html.match(/<td>3<\/td>/g)).toHaveLength(4);
  expect(html.match(/class="status passed"/g)).toHaveLength(1);
  expect(html.match(/class="status failed"/g)).toHaveLength(1);
  expect(html).not.toContain('disabled=""');
});

test('suite members also display one row per configured matrix cell', () => {
  const html = render(
    [{ id: 'starter', evalIds: ['echo'] }],
    [{ ...standalone, suiteId: 'starter' }],
    [],
    { id: 'benchmark', parameters: { model: ['glm', 'scout'] } },
    'starter',
  );
  expect(html).toContain('class="nested"');
  expect(html).toContain('class="table-sort">model ↕</button>');
  expect(html.match(/Run eval/g)).toHaveLength(2);
  expect(html).not.toContain('<select');
});

test('empty state is shown only when there are no evals and no suites', () => {
  expect(render([], [])).toContain('No evals or suites are loaded.');
});
