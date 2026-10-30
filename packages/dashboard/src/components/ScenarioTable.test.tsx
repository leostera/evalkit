import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { ScenarioTable } from './ScenarioTable.js';

const sortLabels = (html: string) =>
  [...html.matchAll(/class="table-sort[^"]*">([^<]+)</g)].map(
    (match) => match[1],
  );

/** Per-row run buttons, not the suite's. */
const runButtons = (html: string) =>
  (html.match(/>Run<\/(?:button|span)>/g) ?? []).length;

const standalone: CatalogEval = {
  id: 'echo',
  name: 'Echo Worker',
  path: 'echo',
  trialCount: 1,
  agent: { kind: 'worker', runtimes: [{ name: 'local', kind: 'bun' }] },
  datasets: [],
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
    <ScenarioTable
      api={{} as DashboardApi}
      suites={suites}
      catalog={catalog}
      runs={runs}
      matrix={matrix}
      selectedSuiteId={selectedSuiteId}
    />,
  );
}

test('discovered scenarios are visible without a suite', () => {
  const html = render([], [standalone]);
  expect(html).toContain('>Scenarios<');
  expect(html).toContain('Echo Worker');
  expect(html).toContain('href="/scenarios/echo"');
  expect(runButtons(html)).toBe(1);
  expect(html).not.toContain('No suites are loaded');
});

test('scenarios without a suite remain visible alongside suites without duplicating suite members', () => {
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
  expect(html).toContain('Scenarios without a suite');
  expect(html).toContain('Echo Worker');
  expect(html).not.toContain('Greeting'); // suite members are only shown when expanded
});

test('a scenario shows its latest run, linked to the run page', () => {
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
  expect(html).toContain('data-status="running"');
  expect(html).not.toContain('data-status="passed"');
  expect(html).toContain('href="/runs/new-run"');
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
  expect(sortLabels(html)).toContain('model');
  expect(sortLabels(html)).toContain('mode');
  expect(html).toContain('aria-label="Filter matrix cells"');
  expect(html).not.toContain('<select');
  expect(runButtons(html)).toBe(4);
  expect(html).toContain('with-docs');
  expect(html).toContain('without-docs');
  expect(html.match(/<td class="tabular-nums">3<\/td>/g)).toHaveLength(4);
  expect(html.match(/data-status="passed"/g)).toHaveLength(1);
  expect(html.match(/data-status="failed"/g)).toHaveLength(1);
  expect(html).not.toContain('disabled=""');
});

test('constrained matrices load eligible cells instead of rendering a Cartesian product', () => {
  const html = render([], [standalone], [], {
    id: 'platforms',
    parameters: { os: ['windows', 'linux'], arch: ['arm64', 'x86_64'] },
    constrained: true,
  });
  expect(html).toContain('Loading cells');
  expect(runButtons(html)).toBe(0);
});

test('suite members also display one row per configured matrix cell', () => {
  const html = render(
    [{ id: 'starter', evalIds: ['echo'] }],
    [{ ...standalone, suiteId: 'starter' }],
    [],
    { id: 'benchmark', parameters: { model: ['glm', 'scout'] } },
    'starter',
  );
  expect(html).toContain('class="nested ');
  expect(sortLabels(html)).toContain('model');
  expect(runButtons(html)).toBe(2);
  expect(html).not.toContain('<select');
});

test('empty state is shown only when there are no scenarios', () => {
  expect(render([], [])).toContain('No scenarios are loaded.');
});

test('each scenario row links to its agent and to its runs, per matrix cell', () => {
  const matrix = { id: 'benchmark', parameters: { model: ['glm', 'scout'] } };
  const html = render(
    [],
    [{ ...standalone, agent: { ...standalone.agent, id: 'echo-worker' } }],
    [],
    matrix,
  );
  expect(html).toContain('href="/agents?agent=echo-worker"');
  const decode = (href: string) =>
    new URLSearchParams(href.replace('/runs?', '').replaceAll('&amp;', '&'));
  const runLinks = [...html.matchAll(/href="(\/runs\?[^"]+)"/g)].map((match) =>
    decode(match[1]!),
  );
  expect(runLinks.map((search) => search.getAll('p.model'))).toEqual([
    ['"glm"'],
    ['"scout"'],
  ]);
  expect(runLinks.every((search) => search.get('eval') === '"echo"')).toBe(
    true,
  );
});
