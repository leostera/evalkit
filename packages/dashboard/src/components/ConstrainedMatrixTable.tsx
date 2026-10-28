import { Table } from '@cloudflare/kumo';
import { useEffect, useState } from 'react';
import type {
  CatalogEval,
  DashboardApi,
  MatrixCellPage,
  MatrixSummary,
  RunSummary,
} from '../api.js';
import { TableMessage } from './DataTable.js';
import { ErrorBanner } from './ErrorBanner.js';
import { EvalRow } from './EvalRow.js';
import {
  fixedCellColumns,
  MatrixCellFrame,
  MatrixCellHeader,
} from './MatrixCellHeader.js';
import { Pager } from './Pager.js';
import { SearchField } from './SearchField.js';
import { useSort } from './SortableTable.js';

const PAGE_SIZE = 50;

export function ConstrainedMatrixTable({
  api,
  evalIds,
  catalog,
  matrix,
  runs,
  nested = false,
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
  const { sort, toggleSort } = useSort({ key: 'eval', direction: 'asc' }, () =>
    setPage(0),
  );
  const [result, setResult] = useState<MatrixCellPage>();
  const [error, setError] = useState<string>();
  const dimensions = matrix.dimensions ?? Object.keys(matrix.parameters);
  const ids = evalIds.join(',');
  useEffect(() => {
    let active = true;
    // A new query must not display an error or page from the prior query.
    // oxlint-disable-next-line react/set-state-in-effect
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
  const columns = dimensions.length + fixedCellColumns;
  return (
    <div className="flex flex-col gap-2">
      <SearchField
        label="Filter matrix cells"
        placeholder="Eval, parameter or agent"
        value={query}
        count={`${result?.total ?? 0} of ${result?.planned ?? 0} eligible cells`}
        onChange={(next) => {
          setQuery(next);
          setPage(0);
        }}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <MatrixCellFrame nested={nested}>
        <MatrixCellHeader
          axes={dimensions}
          sort={sort}
          onSort={toggleSort}
          planned
        />
        <Table.Body>
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
                cellParameters={cell.parameters}
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
            <TableMessage colSpan={columns}>Loading cells…</TableMessage>
          ) : null}
          {result && !result.cells.length ? (
            <TableMessage colSpan={columns}>No matching cells.</TableMessage>
          ) : null}
        </Table.Body>
      </MatrixCellFrame>
      <Pager
        label="Matrix cells pages"
        noun="Cells"
        page={page}
        pageSize={PAGE_SIZE}
        total={result?.total ?? 0}
        onPage={setPage}
      />
    </div>
  );
}
