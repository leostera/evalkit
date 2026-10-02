import { useEffect, useState } from 'react';
import type { DashboardApi, RunSummary, TrialSummary } from '../api.js';

/** Keep text filtering responsive while persisting its settled value in the URL. */
export function useRunFilters(
  search?: URLSearchParams,
  onSearchChange?: (next: URLSearchParams) => void,
) {
  const [localSearch, setLocalSearch] = useState(() => new URLSearchParams());
  const activeSearch = search ?? localSearch;
  const updateSearch = onSearchChange ?? setLocalSearch;
  const urlQuery = activeSearch.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);

  useEffect(() => setQuery(urlQuery), [urlQuery]);
  useEffect(() => {
    if (query === urlQuery) return;
    const timeout = setTimeout(() => {
      const next = new URLSearchParams(activeSearch);
      if (query) next.set('q', query);
      else next.delete('q');
      updateSearch(next);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, urlQuery, activeSearch, updateSearch]);

  const setField = (field: string, value: string) => {
    const next = new URLSearchParams(activeSearch);
    if (value) next.set(field, value);
    else next.delete(field);
    updateSearch(next);
  };
  const toggleFacet = (facet: string, value: string) => {
    const next = new URLSearchParams(activeSearch);
    const values = next.getAll(facet);
    next.delete(facet);
    for (const selected of values.filter((selected) => selected !== value))
      next.append(facet, selected);
    if (!values.includes(value)) next.append(facet, value);
    updateSearch(next);
  };
  const clearFilters = () => updateSearch(new URLSearchParams());
  return { activeSearch, query, setQuery, setField, toggleFacet, clearFilters };
}

/** A run can appear before its first trial is persisted; refresh expanded trials as runs are polled. */
export function useRunTrials(
  api: DashboardApi,
  runs: RunSummary[],
  selectedRunId?: string,
) {
  const [trials, setTrials] = useState<Record<string, TrialSummary[]>>({});
  useEffect(() => {
    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) return;
    let active = true;
    void api.listTrials(selectedRunId).then((value) => {
      if (active)
        setTrials((current) => ({ ...current, [selectedRunId]: value }));
    });
    return () => {
      active = false;
    };
  }, [api, runs, selectedRunId]);

  const loadTrials = (runId: string) => {
    if (!trials[runId])
      void api
        .listTrials(runId)
        .then((value) =>
          setTrials((current) => ({ ...current, [runId]: value })),
        );
  };
  return { trials, loadTrials };
}
