import { Button, Checkbox, Input } from '@cloudflare/kumo';
import {
  CaretRightIcon,
  FunnelIcon,
  FunnelXIcon,
  XIcon,
} from '@phosphor-icons/react';
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
 * A filter bar above the runs table, so the table keeps the page's full
 * width. Active filters show as removable chips; the panel below the bar holds
 * facet checkboxes laid out side by side, a date range, and archived runs. Its
 * search narrows every group.
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  // A facet with one value cannot narrow anything; keep it only while checked.
  const shown = searchFacets(facets, query, search).filter(
    (facet) => facet.values.length > 1 || search.has(facet.key),
  );
  const showDates = matches(term, 'date', 'from', 'to', 'started');
  const showArchived =
    archivedCount > 0 && matches(term, 'archived', 'removed');
  const active = [...search.keys()].filter((key) => key !== 'q').length;
  const chips = activeChips(facets, search);
  return (
    <section
      aria-label="Run filters"
      className="runs-filter-panel rounded-lg border border-kumo-line bg-kumo-base"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
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
        {chips.map((chip) => (
          <button
            key={`${chip.field}=${chip.value}`}
            type="button"
            className="active-filter inline-flex max-w-[16rem] cursor-pointer items-center gap-1 rounded-full border border-kumo-line bg-kumo-elevated px-2 py-0.5 text-xs"
            title={`Remove ${chip.label}: ${chip.choice}`}
            onClick={() =>
              chip.facet
                ? onToggleFacet(chip.field, chip.value)
                : onField(chip.field, '')
            }
          >
            <span className="text-kumo-subtle">{chip.label}:</span>
            <span className="truncate">{chip.choice}</span>
            <XIcon aria-hidden className="size-3 shrink-0 text-kumo-subtle" />
          </button>
        ))}
        <Button
          size="xs"
          variant="ghost"
          shape="square"
          className="clear-filters ml-auto shrink-0"
          icon={<FunnelXIcon />}
          aria-label="Clear filters"
          title="Clear filters"
          disabled={!active}
          onClick={onClear}
        />
      </div>
      {open ? (
        <div className="flex max-h-[min(32rem,60vh)] flex-col gap-3 overflow-y-auto border-t border-kumo-hairline px-3 py-3">
          <Input
            type="search"
            size="xs"
            aria-label="Search filters"
            placeholder="Search filters"
            value={query}
            className="max-w-xs"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-x-6 gap-y-4">
            {shown.map((facet) => (
              <FacetGroup
                key={facet.key}
                facet={facet}
                checked={search.getAll(facet.key)}
                searching={term.length > 0}
                onToggle={(value) => onToggleFacet(facet.key, value)}
              />
            ))}
            {showDates ? (
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-1 text-xs font-medium text-kumo-subtle">
                  Started
                </legend>
                <Input
                  type="date"
                  size="xs"
                  label="From"
                  value={search.get('from') ?? ''}
                  onChange={(event) => onField('from', event.target.value)}
                />
                <Input
                  type="date"
                  size="xs"
                  label="To"
                  value={search.get('to') ?? ''}
                  onChange={(event) => onField('to', event.target.value)}
                />
              </fieldset>
            ) : null}
            {showArchived ? (
              <fieldset className="flex min-w-0 flex-col gap-1">
                <legend className="mb-1 text-xs font-medium text-kumo-subtle">
                  Archived
                </legend>
                <Checkbox
                  className="runs-choice min-w-0"
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
              </fieldset>
            ) : null}
          </div>
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

type Chip = {
  field: string;
  value: string;
  label: string;
  choice: string;
  /** A facet choice toggles off; a plain field clears. */
  facet: boolean;
};

/** Every active filter as a chip, labelled like its checkbox. */
export function activeChips(
  facets: readonly RunFacet[],
  search: URLSearchParams,
): Chip[] {
  const fields: Record<string, string> = {
    from: 'From',
    to: 'To',
    archived: 'Archived',
  };
  return [...search.entries()].flatMap(([field, value]): Chip[] => {
    if (field === 'q') return [];
    const facet = facets.find((entry) => entry.key === field);
    if (facet) {
      const choice = facet.values.find((entry) => entry.key === value);
      return [
        {
          field,
          value,
          label: facet.label,
          choice: choice?.label ?? value,
          facet: true,
        },
      ];
    }
    return [
      {
        field,
        value,
        label: fields[field] ?? field,
        choice: value,
        facet: false,
      },
    ];
  });
}

/** Choices shown before "Show all"; checked choices are always shown too. */
export const FACET_PREVIEW = 6;

/**
 * Which of a facet's choices to show. Short lists keep their natural order;
 * long ones (a hundred scenarios) put checked choices first, then the most
 * common, and show only a few until expanded.
 */
export function visibleChoices(
  values: readonly FacetChoice[],
  checked: readonly string[],
  expanded: boolean,
  query = '',
): { choices: FacetChoice[]; hidden: number } {
  const long = values.length > FACET_PREVIEW + 2;
  const term = query.trim().toLowerCase();
  const matching = term
    ? values.filter(
        (choice) =>
          choice.label.toLowerCase().includes(term) ||
          checked.includes(choice.key),
      )
    : [...values];
  if (!long) return { choices: matching, hidden: 0 };
  const ordered = matching.sort(
    (a, b) =>
      Number(checked.includes(b.key)) - Number(checked.includes(a.key)) ||
      b.count - a.count ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  if (expanded) return { choices: ordered, hidden: 0 };
  const selected = ordered.filter((choice) => checked.includes(choice.key));
  const preview = [
    ...selected,
    ...ordered
      .filter((choice) => !checked.includes(choice.key))
      .slice(0, FACET_PREVIEW),
  ];
  return { choices: preview, hidden: ordered.length - preview.length };
}

function FacetGroup({
  facet,
  checked,
  searching,
  onToggle,
}: {
  facet: RunFacet;
  checked: readonly string[];
  /** The panel search already narrowed the choices; show every match. */
  searching: boolean;
  onToggle(value: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const { choices, hidden } = visibleChoices(
    facet.values,
    checked,
    expanded || searching,
    expanded ? query : '',
  );
  return (
    <fieldset className="facet-group flex min-w-0 flex-col gap-1">
      <legend className="mb-1 flex w-full items-baseline justify-between gap-2 text-xs font-medium text-kumo-subtle">
        <span className="truncate">{facet.label}</span>
        <span className="tabular-nums">{facet.values.length}</span>
      </legend>
      {expanded && facet.values.length > FACET_PREVIEW + 2 ? (
        <Input
          type="search"
          size="xs"
          aria-label={`Search ${facet.label}`}
          placeholder={`Search ${facet.values.length} values`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {choices.map((choice) => (
          <Checkbox
            key={choice.key}
            className="runs-choice min-w-0"
            checked={checked.includes(choice.key)}
            onCheckedChange={() => onToggle(choice.key)}
            label={
              <span
                className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-[13px]"
                title={choice.label}
              >
                <span className="truncate">{choice.label}</span>
                <span className="text-xs text-kumo-subtle tabular-nums">
                  {choice.count}
                </span>
              </span>
            }
          />
        ))}
        {!choices.length ? (
          <span className="text-xs text-kumo-subtle">No matches.</span>
        ) : null}
      </div>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          className="facet-more self-start text-xs text-kumo-link hover:underline"
          onClick={() => {
            setExpanded((value) => !value);
            setQuery('');
          }}
        >
          {expanded ? 'Show fewer' : `Show all ${facet.values.length}`}
        </button>
      ) : null}
    </fieldset>
  );
}
