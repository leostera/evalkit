import { expect, test } from 'bun:test';
import type { RunSummary } from '../api.js';
import {
  filterRunFacets,
  MISSING,
  parameterFacet,
  runFacets,
} from './run-facets.js';

const base = {
  evalId: 'api',
  status: 'passed',
  completedTrials: 1,
  requestedTrials: 1,
} as const;
const runs: RunSummary[] = [
  {
    ...base,
    id: 'old-ruby',
    matrixId: 'old-matrix',
    parameters: {
      language: 'ruby',
      framework: 'rails',
      formalModel: true,
      spec: false,
    },
    startedAt: '2026-01-01T12:00:00Z',
  },
  {
    ...base,
    id: 'new-ruby',
    matrixId: 'new-matrix',
    parameters: {
      language: 'ruby',
      framework: 'rails',
      formalModel: true,
      spec: false,
    },
    startedAt: '2026-02-01T12:00:00Z',
  },
  {
    ...base,
    id: 'no-framework',
    parameters: {
      language: 'ruby',
      framework: null,
      formalModel: false,
      spec: false,
    },
    startedAt: '2026-03-01T12:00:00Z',
  },
  {
    ...base,
    id: 'go',
    parameters: {
      language: 'go',
      framework: 'gin',
      formalModel: true,
      spec: true,
    },
    startedAt: '2026-04-01T12:00:00Z',
  },
  { ...base, id: 'missing', startedAt: '2026-05-01T12:00:00Z' },
];

test('facets use persisted values and distinguish null, missing, booleans and strings', () => {
  const facets = runFacets(runs);
  const framework = facets.find(
    (facet) => facet.key === parameterFacet('framework'),
  )!;
  expect(framework.values).toContainEqual({
    key: MISSING,
    label: 'Missing',
    count: 1,
  });
  expect(framework.values).toContainEqual({
    key: 'null',
    label: 'null',
    count: 1,
  });
  expect(framework.values).toContainEqual({
    key: '"rails"',
    label: 'rails',
    count: 2,
  });
  expect(facets.find((facet) => facet.key === 'matrix')?.values).toContainEqual(
    { key: MISSING, label: 'Missing', count: 3 },
  );
});

test('OR within a facet, AND across facets; fixed params show every historical matching run', () => {
  const filters = new URLSearchParams();
  for (const [key, value] of Object.entries({
    language: 'ruby',
    framework: 'rails',
    formalModel: true,
    spec: false,
  }))
    filters.append(parameterFacet(key), JSON.stringify(value));
  expect(filterRunFacets(runs, filters).map((run) => run.id)).toEqual([
    'old-ruby',
    'new-ruby',
  ]);
  filters.append(parameterFacet('framework'), 'null');
  expect(filterRunFacets(runs, filters).map((run) => run.id)).toEqual([
    'old-ruby',
    'new-ruby',
  ]);
  filters.delete(parameterFacet('formalModel'));
  expect(filterRunFacets(runs, filters).map((run) => run.id)).toEqual([
    'old-ruby',
    'new-ruby',
    'no-framework',
  ]);
  filters.set('from', '2026-02-01');
  filters.set('to', '2026-03-31');
  expect(filterRunFacets(runs, filters).map((run) => run.id)).toEqual([
    'new-ruby',
    'no-framework',
  ]);
  filters.delete(parameterFacet('framework'));
  filters.append(parameterFacet('framework'), MISSING);
  expect(filterRunFacets(runs, filters)).toEqual([]);
});
