import { canonicalParameters, type JsonValue } from '@evalkit/core';
import type { RunSummary } from '../api.js';

export const MISSING = '@missing'; // distinct from every canonical JSON value
export const parameterFacet = (key: string) => `p.${key}`;

export type FacetChoice = { key: string; label: string; count: number };
export type RunFacet = { key: string; label: string; values: FacetChoice[] };

function add(facet: Map<string, FacetChoice>, key: string, label: string) {
  const current = facet.get(key);
  if (current) current.count++;
  else facet.set(key, { key, label, count: 1 });
}

/** Choices come from saved reports, never from the current authored matrix. */
export function runFacets(runs: readonly RunSummary[]): RunFacet[] {
  const keys = [
    ...new Set(runs.flatMap((run) => Object.keys(run.parameters ?? {}))),
  ].sort();
  const facets = [
    { key: 'eval', label: 'Eval' },
    { key: 'matrix', label: 'Matrix' },
    { key: 'status', label: 'Status' },
    ...keys.map((key) => ({ key: parameterFacet(key), label: key })),
  ];
  return facets.map(({ key, label }) => {
    const values = new Map<string, FacetChoice>();
    for (const run of runs) {
      const raw =
        key === 'eval'
          ? run.evalId
          : key === 'matrix'
            ? run.matrixId
            : key === 'status'
              ? run.status
              : run.parameters?.[key.slice(2)];
      const present =
        key === 'eval' ||
        key === 'status' ||
        (key === 'matrix'
          ? run.matrixId !== undefined
          : Object.hasOwn(run.parameters ?? {}, key.slice(2)));
      add(
        values,
        present ? canonicalParameters(raw as JsonValue) : MISSING,
        present
          ? String(typeof raw === 'string' ? raw : JSON.stringify(raw))
          : 'Missing',
      );
    }
    return {
      key,
      label,
      values: [...values.values()].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }),
      ),
    };
  });
}

export function filterRunFacets(
  runs: readonly RunSummary[],
  search: URLSearchParams,
): RunSummary[] {
  const facets = [...search.keys()].filter(
    (key) => ['eval', 'matrix', 'status'].includes(key) || key.startsWith('p.'),
  );
  const from = search.get('from');
  const to = search.get('to');
  return runs.filter((run) => {
    if (from && run.startedAt.slice(0, 10) < from) return false;
    if (to && run.startedAt.slice(0, 10) > to) return false;
    return facets.every((facet) => {
      const values = search.getAll(facet);
      const present =
        facet === 'eval' ||
        facet === 'status' ||
        (facet === 'matrix'
          ? run.matrixId !== undefined
          : Object.hasOwn(run.parameters ?? {}, facet.slice(2)));
      const value =
        facet === 'eval'
          ? run.evalId
          : facet === 'matrix'
            ? run.matrixId
            : facet === 'status'
              ? run.status
              : run.parameters?.[facet.slice(2)];
      const key = present ? canonicalParameters(value as JsonValue) : MISSING;
      return values.includes(key);
    });
  });
}
