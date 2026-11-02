import { useEffect, useState } from 'react';
import type { DashboardApi, RunDetail, RunSummary } from '../api.js';

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
 * One run's scores, checks and attachments. A running run has none yet, so
 * they reload whenever the polled run summary changes.
 */
export function useRunDetail(api: DashboardApi, run: RunSummary | undefined) {
  const [state, setState] = useState<{
    signature?: string;
    detail?: RunDetail;
    error?: string;
  }>({});
  const signature = run
    ? `${run.id}:${run.status}:${run.completedAt ?? ''}`
    : '';
  useEffect(() => {
    if (!run) return;
    let active = true;
    void api
      .getRun(run.id)
      .then((detail) => {
        if (active) setState({ signature, detail });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            signature,
            error:
              cause instanceof Error ? cause.message : 'Unable to load the run',
          });
      });
    return () => {
      active = false;
    };
    // The signature captures every run change that can add scores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, signature]);
  // Keep showing the last detail while a newer one loads, but never another run's.
  return state.signature?.startsWith(`${run?.id}:`) ? state : {};
}
