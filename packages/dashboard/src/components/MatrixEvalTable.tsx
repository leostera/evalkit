import { useState } from 'react';
import type { CatalogEval, MatrixSummary, RunSummary } from '../api.js';
import { agentName } from './agentName.js';
import { EvalRow } from './EvalRow.js';
import {
  SortableHeader,
  useSortedRows,
  type SortState,
} from './SortableTable.js';

const PAGE_SIZE = 50;
type Axis = [string, unknown[]];
export type MatrixRow = {
  id: string;
  parameters: Record<string, unknown>;
  values: unknown[];
};

/** Decode an interval in configured order; no Cartesian DOM is generated. */
export function matrixEvalPage(
  evalIds: readonly string[],
  axes: readonly Axis[],
  offset: number,
  size: number,
): { rows: MatrixRow[]; total: number } {
  const perEval = axes.reduce((count, [, values]) => count * values.length, 1);
  const total = evalIds.length * perEval;
  if (!Number.isSafeInteger(total))
    throw new Error('Matrix exceeds safe cell count');
  const rows: MatrixRow[] = [];
  for (let index = offset; index < Math.min(offset + size, total); index++) {
    const id = evalIds[Math.floor(index / perEval)]!;
    let remaining = index % perEval;
    const parameters: Record<string, unknown> = {};
    const values: unknown[] = Array(axes.length);
    for (let axisIndex = axes.length - 1; axisIndex >= 0; axisIndex--) {
      const [axis, choices] = axes[axisIndex]!;
      const choice = choices[remaining % choices.length];
      parameters[axis] = choice;
      values[axisIndex] = choice;
      remaining = Math.floor(remaining / choices.length);
    }
    rows.push({ id, parameters, values });
  }
  return { rows, total };
}

function cellKey(
  id: string,
  axes: readonly Axis[],
  parameters: Record<string, unknown>,
): string {
  return JSON.stringify([id, axes.map(([axis]) => parameters[axis])]);
}

function display(value: unknown): string {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value) ?? String(value));
}

/** Search the entire cell set, not just the visible page. */
export function filterMatrixRows(
  rows: readonly MatrixRow[],
  query: string,
  label: (row: MatrixRow) => readonly unknown[],
): MatrixRow[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...rows];
  return rows.filter((row) => {
    const haystack = label(row).map(display).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function MatrixEvalTable({
  evalIds,
  catalog,
  matrix,
  runs,
  nested = false,
  onRun,
  onOpenEval,
}: {
  evalIds: string[];
  catalog: CatalogEval[];
  matrix?: MatrixSummary | null;
  runs: RunSummary[];
  nested?: boolean;
  onRun(path: string, parameters?: Record<string, unknown>): void;
  onOpenEval(entry: CatalogEval): void;
}) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({
    key: 'eval',
    direction: 'asc',
  });
  // Keep the project's declared axis order in both columns and cells.
  const axes: Axis[] = matrix ? Object.entries(matrix.parameters) : [];
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const latest = new Map<string, RunSummary>();
  for (const run of runs) {
    if (matrix && (run.matrixId !== matrix.id || !run.parameters)) continue;
    const key = matrix
      ? cellKey(run.evalId, axes, run.parameters!)
      : run.evalId;
    const previous = latest.get(key);
    if (!previous || previous.startedAt <= run.startedAt) latest.set(key, run);
  }
  const evaluationFor = (row: MatrixRow) => catalogById.get(row.id);
  const statusFor = (row: MatrixRow) =>
    latest.get(matrix ? cellKey(row.id, axes, row.parameters) : row.id)?.status;
  const { total } = matrixEvalPage(evalIds, axes, 0, 0);
  // Sorting and searching operate across all cells; only the selected page reaches the DOM.
  const filtered = filterMatrixRows(
    matrixEvalPage(evalIds, axes, 0, total).rows,
    query,
    (row) => {
      const evaluation = evaluationFor(row);
      return [
        evaluation?.name ?? row.id,
        row.id,
        evaluation?.path ?? row.id,
        ...row.values,
        agentName(evaluation),
        evaluation?.agent.runtimes.map((runtime) => runtime.name).join(', ') ??
          'default',
        statusFor(row) ?? 'not run',
      ];
    },
  );
  const sorted = useSortedRows(filtered, sort, (row, key) => {
    const evaluation = evaluationFor(row);
    if (key.startsWith('axis:')) return display(row.parameters[key.slice(5)]);
    if (key === 'eval') return evaluation?.name ?? row.id;
    if (key === 'agent') return agentName(evaluation);
    if (key === 'runtime')
      return (
        evaluation?.agent.runtimes.map((runtime) => runtime.name).join(', ') ??
        'default'
      );
    if (key === 'trials') return matrix?.trials ?? evaluation?.trialCount ?? 0;
    if (key === 'status') return statusFor(row) ?? 'not run';
    return '';
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
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
          placeholder="Eval, parameter, agent or status"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <span>
          {sorted.length} of {total} cells
        </span>
      </label>
      <table className={nested ? 'nested' : 'data-table'}>
        <thead>
          <tr>
            <SortableHeader
              label="Eval"
              sortKey="eval"
              sort={sort}
              onSort={onSort}
            />
            {axes.map(([axis]) => (
              <SortableHeader
                key={axis}
                label={axis}
                sortKey={`axis:${axis}`}
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
            <SortableHeader
              label="Runtime"
              sortKey="runtime"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Trials"
              sortKey="trials"
              sort={sort}
              onSort={onSort}
            />
            <SortableHeader
              label="Latest run"
              sortKey="status"
              sort={sort}
              onSort={onSort}
            />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => {
              const evaluation = evaluationFor(row);
              return (
                <EvalRow
                  key={cellKey(row.id, axes, row.parameters)}
                  id={row.id}
                  evaluation={evaluation}
                  parameters={row.values}
                  trials={matrix?.trials}
                  status={statusFor(row)}
                  onRun={
                    evaluation && matrix !== undefined
                      ? () =>
                          onRun(
                            evaluation.path,
                            matrix ? row.parameters : undefined,
                          )
                      : undefined
                  }
                  runDisabled={!!evaluation && matrix === undefined}
                  onOpen={evaluation ? () => onOpenEval(evaluation) : undefined}
                />
              );
            })
          ) : (
            <tr>
              <td colSpan={axes.length + 6}>No matching cells.</td>
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length > PAGE_SIZE ? (
        <nav className="matrix-pages" aria-label="Matrix cells pages">
          <span>
            Cells {currentPage * PAGE_SIZE + 1}–
            {Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <button
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            disabled={currentPage === pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </>
  );
}
