import { canonicalParameters } from '@evalkit/core/canonical-json';
import { useMemo } from 'react';
import type {
  CatalogEval,
  RunSummary,
  SuiteSummary,
  TrialSummary,
} from '../api.js';
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
 * The filters Runs, Trials and Workspaces share. They live in the URL, so the
 * same query carries over between the three pages. On trial pages the status
 * filter is the trial's own status rather than its run's.
 */
export function useRunSelection({
  runs,
  catalog,
  suites,
  search,
  onSearchChange,
  trialStatus = false,
}: {
  runs: readonly RunSummary[];
  catalog: readonly CatalogEval[];
  suites: readonly SuiteSummary[];
  search?: URLSearchParams;
  onSearchChange?(next: URLSearchParams): void;
  trialStatus?: boolean;
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
  const runSearch = useMemo(() => {
    if (!trialStatus) return activeSearch;
    const next = new URLSearchParams(activeSearch);
    next.delete('status');
    return next;
  }, [activeSearch, trialStatus]);
  const filteredRuns = useMemo(
    () =>
      filterRuns(filterRunFacets(listed, runSearch), query, suites, catalog),
    [listed, runSearch, query, suites, catalog],
  );
  const statuses = activeSearch.getAll('status');
  return {
    ...filters,
    listed,
    facets,
    filteredRuns,
    archivedCount,
    /** Whether a trial passes the status filter, on trial pages. */
    keepTrial: (trial: TrialSummary) =>
      !statuses.length || statuses.includes(canonicalParameters(trial.status)),
  };
}

export type RunSelection = ReturnType<typeof useRunSelection>;

/** The status facet counted over trials instead of runs. */
export function withTrialStatus(
  facets: readonly RunFacet[],
  trials: readonly TrialSummary[],
): RunFacet[] {
  const counts = new Map<string, number>();
  for (const trial of trials)
    counts.set(trial.status, (counts.get(trial.status) ?? 0) + 1);
  return facets.map((facet) =>
    facet.key === 'status'
      ? {
          ...facet,
          label: 'Trial status',
          values: [...counts]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([status, count]) => ({
              key: canonicalParameters(status),
              label: status,
              count,
            })),
        }
      : facet,
  );
}

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
