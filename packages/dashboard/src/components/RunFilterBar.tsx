import { useMemo } from 'react';
import type { CatalogEval, RunSummary, SuiteSummary } from '../api.js';
import { RunFilters } from './RunFilters.js';
import { filterRunFacets, runFacets, type RunFacet } from './run-facets.js';
import { displayValue as display } from './run-columns.js';
import { SearchField } from './SearchField.js';
import { useRunFilters } from './use-run-table-state.js';

/** Free-text search over a run's scenario, suite, agent, status, commit and parameters. */
export function filterRuns(
  runs: readonly RunSummary[],
  query: string,
  suites: readonly SuiteSummary[],
  catalog: readonly CatalogEval[],
): RunSummary[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...runs];
  return runs.filter((run) => {
    const evaluation = catalog.find((entry) => entry.id === run.evalId);
    const suite = suites.find((entry) => entry.id === run.suiteId);
    const parameters = Object.entries(run.parameters ?? {}).flatMap(
      ([key, value]) => [key, display(value)],
    );
    const haystack = [
      run.id,
      run.batch?.id,
      run.evalId,
      evaluation?.name,
      run.suiteId,
      suite?.name,
      run.matrixId,
      evaluation?.agent.name,
      evaluation?.agent.kind,
      run.status,
      run.score,
      run.startedAt,
      run.source?.commit,
      run.source?.ref,
      run.source?.dirty ? 'dirty' : undefined,
      ...parameters,
    ]
      .map(display)
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * The filters Runs and Workspaces share. They live in the URL, so the same
 * query carries over between the two pages.
 */
export function useRunSelection({
  runs,
  catalog,
  suites,
  search,
  onSearchChange,
}: {
  runs: readonly RunSummary[];
  catalog: readonly CatalogEval[];
  suites: readonly SuiteSummary[];
  search?: URLSearchParams;
  onSearchChange?(next: URLSearchParams): void;
}) {
  const filters = useRunFilters(search, onSearchChange);
  const { activeSearch, query } = filters;
  // Runs of evals removed from the project (`evalkit tidy`) are hidden by default.
  const showArchived = activeSearch.get('archived') === 'show';
  const archivedCount = runs.filter((run) => run.archived).length;
  const listed = useMemo(
    () => (showArchived ? runs : runs.filter((run) => !run.archived)),
    [runs, showArchived],
  );
  const facets = useMemo(() => runFacets(listed), [listed]);
  const filteredRuns = useMemo(
    () =>
      filterRuns(filterRunFacets(listed, activeSearch), query, suites, catalog),
    [listed, activeSearch, query, suites, catalog],
  );
  return { ...filters, listed, facets, filteredRuns, archivedCount };
}

export type RunSelection = ReturnType<typeof useRunSelection>;

export function RunFilterBar({
  selection,
  facets = selection.facets,
  label,
  count,
}: {
  selection: RunSelection;
  facets?: readonly RunFacet[];
  label: string;
  count: string;
}) {
  return (
    <>
      <SearchField
        label={label}
        placeholder="Scenario, parameter, agent, commit or status"
        value={selection.query}
        count={count}
        onChange={selection.setQuery}
      />
      <RunFilters
        facets={facets}
        search={selection.activeSearch}
        archivedCount={selection.archivedCount}
        onToggleFacet={selection.toggleFacet}
        onField={selection.setField}
        onClear={selection.clearFilters}
      />
    </>
  );
}
