import { Button, Checkbox, Input } from '@cloudflare/kumo';
import { FunnelIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { RunFacet } from './run-facets.js';

/**
 * Facet checkboxes and a date range for saved runs. Starts open on wide
 * screens and collapsed on phones so the table stays reachable.
 */
export function RunFilters({
  facets,
  search,
  onToggleFacet,
  onField,
  onClear,
}: {
  facets: readonly RunFacet[];
  search: URLSearchParams;
  onToggleFacet(facet: string, value: string): void;
  onField(field: string, value: string): void;
  onClear(): void;
}) {
  const [open, setOpen] = useState(
    () =>
      typeof window === 'undefined' ||
      window.matchMedia('(min-width: 901px)').matches,
  );
  return (
    <details
      className="runs-filter-panel group shrink-0 rounded-lg border border-kumo-line bg-kumo-base lg:w-56"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] font-semibold text-kumo-strong select-none">
        <FunnelIcon aria-hidden className="size-3.5 text-kumo-subtle" />
        Filters{search.size ? ` (${search.size} active)` : ''}
      </summary>
      <div className="flex flex-col gap-4 border-t border-kumo-hairline px-3 py-3">
        {facets.map((facet) => (
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
        <Button
          size="xs"
          variant="secondary"
          className="clear-filters self-start"
          disabled={!search.size}
          onClick={onClear}
        >
          Clear filters
        </Button>
      </div>
    </details>
  );
}
