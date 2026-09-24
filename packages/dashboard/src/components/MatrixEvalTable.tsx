import { useState } from 'react';
import type { CatalogEval, MatrixSummary, RunSummary } from '../api.js';
import { EvalRow } from './EvalRow.js';

const PAGE_SIZE = 50;
type Axis = [string, unknown[]];

/** Decode only the requested page; never expand the whole eval × matrix product into DOM rows. */
export function matrixEvalPage(
  evalIds: readonly string[],
  axes: readonly Axis[],
  offset: number,
  size: number,
) {
  const perEval = axes.reduce((count, [, values]) => count * values.length, 1);
  const total = evalIds.length * perEval;
  if (!Number.isSafeInteger(total))
    throw new Error('Matrix exceeds safe cell count');
  const rows: Array<{
    id: string;
    parameters: Record<string, unknown>;
    values: unknown[];
  }> = [];
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
  // Preserve the project's declared axis order in both columns and row expansion.
  const axes: Axis[] = matrix ? Object.entries(matrix.parameters) : [];
  const count = matrixEvalPage(evalIds, axes, 0, 0).total;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const { rows } = matrixEvalPage(
    evalIds,
    axes,
    currentPage * PAGE_SIZE,
    PAGE_SIZE,
  );

  const latest = new Map<string, RunSummary>();
  for (const run of runs) {
    if (matrix && (run.matrixId !== matrix.id || !run.parameters)) continue;
    const key = matrix
      ? cellKey(run.evalId, axes, run.parameters!)
      : run.evalId;
    const previous = latest.get(key);
    if (!previous || previous.startedAt <= run.startedAt) latest.set(key, run);
  }
  return (
    <>
      <table className={nested ? 'nested' : 'data-table'}>
        <thead>
          <tr>
            <th>Eval</th>
            {axes.map(([axis]) => (
              <th key={axis}>{axis}</th>
            ))}
            <th>Agent</th>
            <th>Runtime</th>
            <th>Trials</th>
            <th>Latest run</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, parameters, values }) => {
            const evaluation = catalog.find((entry) => entry.id === id);
            return (
              <EvalRow
                key={cellKey(id, axes, parameters)}
                id={id}
                evaluation={evaluation}
                parameters={values}
                trials={matrix?.trials}
                status={
                  latest.get(matrix ? cellKey(id, axes, parameters) : id)
                    ?.status
                }
                onRun={
                  evaluation && matrix !== undefined
                    ? () =>
                        onRun(evaluation.path, matrix ? parameters : undefined)
                    : undefined
                }
                runDisabled={!!evaluation && matrix === undefined}
                onOpen={evaluation ? () => onOpenEval(evaluation) : undefined}
              />
            );
          })}
        </tbody>
      </table>
      {count > PAGE_SIZE ? (
        <nav className="matrix-pages" aria-label="Matrix cells pages">
          <span>
            Cells {currentPage * PAGE_SIZE + 1}–
            {Math.min((currentPage + 1) * PAGE_SIZE, count)} of {count}
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
