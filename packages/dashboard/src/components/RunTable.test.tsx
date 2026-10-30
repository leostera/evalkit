import { expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { CatalogEval, RunSummary, SuiteSummary } from '../api.js';
import { FACET_PREVIEW, searchFacets, visibleChoices } from './RunFilters.js';
import { filterRuns } from './RunFilterBar.js';
import { RunTable } from './RunTable.js';
import { parameterLayout, relativeTime } from './run-columns.js';
import { runFacets } from './run-facets.js';

/** Run rows link to run pages, which needs a router. */
const renderToStaticMarkup = (element: ReactElement) =>
  renderMarkup(<MemoryRouter>{element}</MemoryRouter>);

const sortLabels = (html: string) =>
  [...html.matchAll(/class="table-sort[^"]*">([^<]+)</g)].map(
    (match) => match[1],
  );

const catalog: CatalogEval[] = [
  {
    id: 'greeting',
    name: 'Greeting',
    path: 'greeting',
    trialCount: 1,
    agent: { kind: 'in-process', name: 'Greeter', runtimes: [] },
    datasets: [],
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

test('only differing parameters become columns, a few at most; the rest wrap in one cell', () => {
  expect(parameterLayout(runs)).toEqual({
    columns: ['enabled', 'model', 'options'],
    overflow: ['retries'],
    constant: [],
  });
  const html = renderToStaticMarkup(
    <RunTable runs={runs} suites={suites} catalog={catalog} />,
  );
  for (const key of ['enabled', 'model', 'options'])
    expect(sortLabels(html)).toContain(key);
  expect(sortLabels(html)).not.toContain('retries');
  expect(html).toContain('Other parameters');
  expect(html).toContain('title="retries=2"');
  expect(html).toContain('{&quot;docs&quot;:true}');
  // Each run opens its own page, and its scenario opens the scenario page.
  expect(html).toContain('href="/runs/run-one"');
  expect(html).toContain('href="/library/scenarios/greeting"');
  // Agent and suite are not columns; the suite sits under the scenario name.
  expect(sortLabels(html)).not.toContain('Agent');
  expect(sortLabels(html)).not.toContain('Suite');
  expect(html).toContain('Starter');
});

test('a parameter with one value on every run is said once above the table', () => {
  const same = runs.slice(0, 2).map((run) => ({
    ...run,
    parameters: { ...run.parameters, region: 'eu' },
  }));
  expect(parameterLayout(same).constant).toEqual([['region', 'eu']]);
  const html = renderToStaticMarkup(
    <RunTable runs={same} suites={suites} catalog={catalog} />,
  );
  expect(html).toContain('Same on every run shown:');
  expect(sortLabels(html)).not.toContain('region');
});

test('start times read as relative for the last week', () => {
  const now = Date.parse('2026-01-10T12:00:00Z');
  expect(relativeTime('2026-01-10T11:59:50Z', now)).toBe('just now');
  expect(relativeTime('2026-01-10T11:57:00Z', now)).toBe('3 min ago');
  expect(relativeTime('2026-01-10T07:00:00Z', now)).toBe('5 h ago');
  expect(relativeTime('2026-01-08T12:00:00Z', now)).toBe('2 d ago');
});

test('large run histories render one page without losing the full count', () => {
  const many = Array.from({ length: 120 }, (_, index) => ({
    ...runs[0]!,
    id: `run-${index}`,
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));
  const html = renderToStaticMarkup(
    <RunTable runs={many} suites={suites} catalog={catalog} />,
  );
  expect(html.match(/href="\/runs\/run-\d+"/g)).toHaveLength(50);
  expect(html).toContain('1–50 of 120');
  expect(html).toContain('50 of 120');
  expect(html).toContain('aria-sort="descending"');
});

test('saved parameter facets and URL filters keep historical runs from different matrix states', () => {
  const search = new URLSearchParams();
  search.append('p.model', '"scout"');
  const html = renderToStaticMarkup(
    <RunTable
      runs={runs}
      suites={suites}
      catalog={catalog}
      search={search}
      onSearchChange={() => {}}
    />,
  );
  expect(html).toContain('Filters (1 active)');
  expect(html).toContain('1 of 3 runs');
  expect(html).toContain('run-one');
  expect(html).not.toContain('run-two');
  expect(
    runFacets(runs)
      .find((facet) => facet.key === 'p.model')!
      .values.map((choice) => choice.label),
  ).toContain('Missing');
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

const render = (search: URLSearchParams, list: RunSummary[] = runs) =>
  renderToStaticMarkup(
    <RunTable
      runs={list}
      suites={suites}
      catalog={catalog}
      search={search}
      onSearchChange={() => {}}
    />,
  );

test('archived runs are hidden by default and shown with archived=show', () => {
  const list = [...runs, { ...runs[0]!, id: 'run-archived', archived: true }];
  const hidden = render(new URLSearchParams(), list);
  expect(hidden).toContain('3 of 3 runs');
  expect(hidden).not.toContain('run-archived');
  const shown = render(new URLSearchParams('archived=show'), list);
  expect(shown).toContain('4 of 4 runs');
  expect(shown).toContain('run-archived');
  expect(shown).toContain('>archived</span>');
  expect(shown).toContain('title="Remove Archived: show"');
});

test('the filter bar sits above the table and shows active filters as chips', () => {
  const html = render(
    new URLSearchParams('status=%22passed%22&from=2026-01-01'),
  );
  expect(html).toContain('aria-label="Clear filters"');
  expect(html.indexOf('Run filters')).toBeLessThan(html.indexOf('<table'));
  expect(html).toContain('title="Remove Status: passed"');
  expect(html).toContain('title="Remove From: 2026-01-01"');
  // The facet panel starts closed, so the bar is one line.
  expect(html).not.toContain('aria-label="Search filters"');
});

test('filter search narrows every facet and keeps checked choices visible', () => {
  const facets = runFacets(runs);
  const checked = new URLSearchParams('status=%22failed%22');
  const narrowed = searchFacets(facets, 'sco', checked);
  expect(narrowed.map((facet) => facet.key)).toEqual(['status', 'p.model']);
  expect(narrowed[0]!.values.map((choice) => choice.label)).toEqual(['failed']);
  expect(narrowed[1]!.values.map((choice) => choice.label)).toEqual(['scout']);
  // A matching group name keeps all its choices.
  expect(
    searchFacets(facets, 'model', new URLSearchParams())[0]!.values.length,
  ).toBe(3);
  expect(searchFacets(facets, '', new URLSearchParams())).toEqual(facets);
});

test('a facet with a hundred values previews the most common, keeps checked ones, and searches when expanded', () => {
  const values = Array.from({ length: 100 }, (_, index) => ({
    key: `"s${index}"`,
    label: `scenario-${index}`,
    count: index % 10,
  }));
  const preview = visibleChoices(values, ['"s0"'], false);
  // The checked choice (count 0) stays, beside the most common ones.
  expect(preview.choices[0]!.label).toBe('scenario-0');
  expect(preview.choices).toHaveLength(FACET_PREVIEW + 1);
  expect(preview.choices.slice(1).every((choice) => choice.count === 9)).toBe(
    true,
  );
  expect(preview.hidden).toBe(100 - FACET_PREVIEW - 1);
  expect(visibleChoices(values, [], true).choices).toHaveLength(100);
  expect(
    visibleChoices(values, [], true, 'scenario-4').choices.map(
      (choice) => choice.label,
    ),
  ).toEqual(expect.arrayContaining(['scenario-4', 'scenario-42']));
  // Short facets keep their order and show everything.
  const short = values.slice(0, 4);
  expect(visibleChoices(short, [], false)).toEqual({
    choices: short,
    hidden: 0,
  });
});
