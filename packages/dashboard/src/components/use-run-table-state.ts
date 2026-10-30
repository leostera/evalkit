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

  // Browser back/forward can change the URL independently of the local draft.
  // oxlint-disable-next-line react/set-state-in-effect
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

/**
 * One run's trials. A run can appear before its first trial is saved, so the
 * list reloads whenever the polled run summary changes.
 */
export function useRunTrials(api: DashboardApi, run: RunSummary | undefined) {
  const [state, setState] = useState<{
    runId?: string;
    trials?: TrialSummary[];
    error?: string;
  }>({});
  const signature = run
    ? `${run.id}:${run.status}:${run.completedTrials}:${run.completedAt ?? ''}`
    : '';
  useEffect(() => {
    if (!run) return;
    let active = true;
    void api
      .listTrials(run.id)
      .then((trials) => {
        if (active) setState({ runId: run.id, trials });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            runId: run.id,
            error:
              cause instanceof Error ? cause.message : 'Unable to load trials',
          });
      });
    return () => {
      active = false;
    };
    // The signature captures every run change that can add or finish trials.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, signature]);
  return state.runId === run?.id ? state : {};
}
