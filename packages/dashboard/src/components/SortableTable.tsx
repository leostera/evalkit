import { useMemo } from 'react';

export type SortState = { key: string; direction: 'asc' | 'desc' };

export function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort(key: string): void;
}) {
  const active = sort.key === sortKey;
  return (
    <th>
      <button className="table-sort" onClick={() => onSort(sortKey)}>
        {label} {active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
      </button>
    </th>
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
