import { useEffect, useState } from 'react';
import type {
  CatalogEval,
  DashboardApi,
  MatrixCellPage,
  MatrixSummary,
  RunSummary,
} from '../api.js';
import { EvalRow } from './EvalRow.js';
import { SortableHeader, type SortState } from './SortableTable.js';

const PAGE_SIZE = 50;

export function ConstrainedMatrixTable({
  api,
  evalIds,
  catalog,
  matrix,
  runs,
  nested,
  onRun,
  onOpenEval,
}: {
  api: DashboardApi;
  evalIds: string[];
  catalog: CatalogEval[];
  matrix: MatrixSummary;
  runs: RunSummary[];
  nested?: boolean;
  onRun(path: string, parameters?: Record<string, unknown>): void;
  onOpenEval(entry: CatalogEval): void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState>({
    key: 'eval',
    direction: 'asc',
  });
  const [result, setResult] = useState<MatrixCellPage>();
  const [error, setError] = useState<string>();
  const dimensions = matrix.dimensions ?? Object.keys(matrix.parameters);
  const ids = evalIds.join(',');
  useEffect(() => {
    let active = true;
    setError(undefined);
    setResult(undefined);
    void api
      .listMatrixCells({
        evalIds: ids.split(',').filter(Boolean),
        query,
        offset: page * PAGE_SIZE,
        sort: sort.key,
        direction: sort.direction,
      })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to list matrix cells',
          );
      });
    return () => {
      active = false;
    };
  }, [api, ids, query, page, sort]);
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const latest = (key: string) =>
    runs
      .filter((run) => run.matrixId === matrix.id && run.cellKey === key)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.status;
  const onSort = (key: string) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
    setPage(0);
  };
  return (
    <>
      <label className="matrix-filter">
        Filter cells
        <input
          type="search"
          aria-label="Filter matrix cells"
          placeholder="Eval, parameter or agent"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <span>
          {result?.total ?? 0} of {result?.planned ?? 0} eligible cells
        </span>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <table className={nested ? 'nested' : 'data-table'}>
        <thead>
          <tr>
            <SortableHeader
              label="Eval"
              sortKey="eval"
              sort={sort}
              onSort={onSort}
            />
            {dimensions.map((key) => (
              <SortableHeader
                key={key}
                label={key}
                sortKey={`axis:${key}`}
                sort={sort}
                onSort={onSort}
              />
            ))}
            <SortableHeader
              label="Agent"
              sortKey="agent"
              sort={sort}
              onSort={onSort}
            />
            <th>Runtime</th>
            <SortableHeader
              label="Trials"
              sortKey="trials"
              sort={sort}
              onSort={onSort}
            />
            <th>Latest run</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {result?.cells.map((cell) => {
            const evaluation = catalogById.get(cell.evalId);
            return (
              <EvalRow
                key={cell.key}
                id={cell.evalId}
                evaluation={evaluation}
                parameters={dimensions.map((key) =>
                  cell.parameters[key] === null ? 'None' : cell.parameters[key],
                )}
                trials={matrix.trials}
                status={latest(cell.key)}
                onRun={
                  evaluation
                    ? () =>
                        onRun(
                          evaluation.path,
                          Object.fromEntries(
                            dimensions.map((key) => [
                              key,
                              cell.parameters[key],
                            ]),
                          ),
                        )
                    : undefined
                }
                onOpen={evaluation ? () => onOpenEval(evaluation) : undefined}
              />
            );
          })}
          {!result && !error ? (
            <tr>
              <td colSpan={dimensions.length + 6}>Loading cells…</td>
            </tr>
          ) : null}
          {result && !result.cells.length ? (
            <tr>
              <td colSpan={dimensions.length + 6}>No matching cells.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {result && result.total > PAGE_SIZE ? (
        <nav className="matrix-pages" aria-label="Matrix cells pages">
          <span>
            Cells {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, result.total)} of {result.total}
          </span>
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button
            disabled={(page + 1) * PAGE_SIZE >= result.total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </>
  );
}
