import { Button, Checkbox, Input } from '@cloudflare/kumo';
import { CaretRightIcon, FunnelIcon, FunnelXIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FacetChoice, RunFacet } from './run-facets.js';

/** Only the facets and choices matching `query`; checked choices always stay visible. */
export function searchFacets(
  facets: readonly RunFacet[],
  query: string,
  search: URLSearchParams,
): RunFacet[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...facets];
  return facets.flatMap((facet) => {
    if (facet.label.toLowerCase().includes(term)) return [facet];
    const values = facet.values.filter(
      (choice: FacetChoice) =>
        choice.label.toLowerCase().includes(term) ||
        search.getAll(facet.key).includes(choice.key),
    );
    return values.length ? [{ ...facet, values }] : [];
  });
}

const matches = (term: string, ...words: string[]) =>
  !term || words.some((word) => word.includes(term));

/**
 * Facet checkboxes, a date range, and archived runs. The header search narrows
 * every filter group; the header button clears all filters. Starts open on wide
 * screens and collapsed on phones so the table stays reachable.
 */
export function RunFilters({
  facets,
  search,
  archivedCount = 0,
  onToggleFacet,
  onField,
  onClear,
}: {
  facets: readonly RunFacet[];
  search: URLSearchParams;
  /** Runs archived by `evalkit tidy`; hidden unless `archived=show`. */
  archivedCount?: number;
  onToggleFacet(facet: string, value: string): void;
  onField(field: string, value: string): void;
  onClear(): void;
}) {
  const [open, setOpen] = useState(
    () =>
      typeof window === 'undefined' ||
      window.matchMedia('(min-width: 901px)').matches,
  );
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const shown = searchFacets(facets, query, search);
  const showDates = matches(term, 'date', 'from', 'to', 'started');
  const showArchived =
    archivedCount > 0 && matches(term, 'archived', 'removed');
  const active = [...search.keys()].filter((key) => key !== 'q').length;
  return (
    <section
      aria-label="Run filters"
      className="runs-filter-panel shrink-0 rounded-lg border border-kumo-line bg-kumo-base lg:w-72"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-kumo-strong select-none"
          onClick={() => setOpen((value) => !value)}
        >
          <CaretRightIcon
            aria-hidden
            className={`size-3 text-kumo-subtle transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <FunnelIcon aria-hidden className="size-3.5 text-kumo-subtle" />
          Filters{active ? ` (${active} active)` : ''}
        </button>
        <Input
          type="search"
          size="xs"
          aria-label="Search filters"
          placeholder="Search filters"
          value={query}
          className="min-w-0 flex-1"
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value) setOpen(true);
          }}
        />
        <Button
          size="xs"
          variant="ghost"
          shape="square"
          className="clear-filters shrink-0"
          icon={<FunnelXIcon />}
          aria-label="Clear filters"
          title="Clear filters"
          disabled={!active}
          onClick={onClear}
        />
      </div>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-kumo-hairline px-3 py-3">
          {shown.map((facet) => (
            <fieldset key={facet.key} className="flex min-w-0 flex-col gap-1">
              <legend className="mb-1 text-xs font-medium text-kumo-subtle">
                {facet.label}
              </legend>
              {facet.values.map((choice) => (
                <Checkbox
                  key={choice.key}
                  className="runs-choice"
                  checked={search.getAll(facet.key).includes(choice.key)}
                  onCheckedChange={() => onToggleFacet(facet.key, choice.key)}
                  label={
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate">{choice.label}</span>
                      <span className="text-xs text-kumo-subtle tabular-nums">
                        {choice.count}
                      </span>
                    </span>
                  }
                />
              ))}
            </fieldset>
          ))}
          {showDates ? (
            <div className="flex flex-col gap-2">
              <Input
                type="date"
                size="sm"
                label="From"
                value={search.get('from') ?? ''}
                onChange={(event) => onField('from', event.target.value)}
              />
              <Input
                type="date"
                size="sm"
                label="To"
                value={search.get('to') ?? ''}
                onChange={(event) => onField('to', event.target.value)}
              />
            </div>
          ) : null}
          {showArchived ? (
            <Checkbox
              className="runs-choice"
              checked={search.get('archived') === 'show'}
              onCheckedChange={(checked) =>
                onField('archived', checked ? 'show' : '')
              }
              label={
                <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-[13px]">
                  <span>Show archived</span>
                  <span className="text-xs text-kumo-subtle tabular-nums">
                    {archivedCount}
                  </span>
                </span>
              }
            />
          ) : null}
          {!shown.length && !showDates && !showArchived ? (
            <p className="text-[13px] text-kumo-subtle">
              No filters match “{query}”.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
