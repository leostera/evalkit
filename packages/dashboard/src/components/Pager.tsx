import { Pagination } from '@cloudflare/kumo';

/** Zero-based page controls for client- or server-paged tables. */
export function Pager({
  label,
  noun,
  page,
  pageSize,
  total,
  onPage,
}: {
  label: string;
  noun: string;
  page: number;
  pageSize: number;
  total: number;
  onPage(page: number): void;
}) {
  if (total <= pageSize) return null;
  const first = page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);
  return (
    <nav className="pager flex items-center justify-end" aria-label={label}>
      <Pagination
        page={page + 1}
        setPage={(next) => onPage(next - 1)}
        perPage={pageSize}
        totalCount={total}
      >
        <Pagination.Info>
          {() => (
            <span className="text-xs text-kumo-subtle tabular-nums">
              {noun} {first}–{last} of {total}
            </span>
          )}
        </Pagination.Info>
        <Pagination.Controls />
      </Pagination>
    </nav>
  );
}
