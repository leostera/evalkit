import { Table } from '@cloudflare/kumo';
import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
} from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

export type SortState = { key: string; direction: 'asc' | 'desc' };

/**
 * Column sort state. Clicking the active column flips its direction; another
 * column starts ascending. `onChange` lets paged tables return to page one.
 */
export function useSort(initial: SortState, onChange?: () => void) {
  const [sort, setSort] = useState(initial);
  const toggleSort = (key: string) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
    onChange?.();
  };
  return { sort, toggleSort };
}

export function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  sticky,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort(key: string): void;
  /** Keep this column visible while the table scrolls horizontally. */
  sticky?: 'left';
}) {
  const active = sort.key === sortKey;
  const direction = active
    ? sort.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : undefined;
  const Icon = !active
    ? CaretUpDownIcon
    : sort.direction === 'asc'
      ? CaretUpIcon
      : CaretDownIcon;
  return (
    <Table.Head aria-sort={direction} sticky={sticky}>
      <button
        type="button"
        className="table-sort inline-flex items-center gap-1 whitespace-nowrap rounded font-medium hover:text-kumo-strong focus-visible:outline-2 focus-visible:outline-kumo-brand"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon
          aria-hidden
          className={active ? 'size-3' : 'size-3 text-kumo-inactive'}
        />
      </button>
    </Table.Head>
  );
}

export function useSortedRows<T>(
  rows: T[],
  sort: SortState,
  value: (row: T, key: string) => unknown,
) {
  return useMemo(() => {
    const sorted = [...rows];
    sorted.sort((left, right) => {
      const a = value(left, sort.key);
      const b = value(right, sort.key);
      const comparison =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a ?? '').localeCompare(String(b ?? ''), undefined, {
              numeric: true,
              sensitivity: 'base',
            });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [rows, sort, value]);
}
