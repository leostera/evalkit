import { Effect } from 'effect';
import { agentRuntimes } from '@evalkit/core';
import type {
  EvalMatrix,
  EvalMatrixCell,
  MatrixSelection,
  RunResult,
} from '@evalkit/core';
import { runEval, type RunEvalOptions } from './index.js';

/** Cells and runs; a run that errored counts as failed, a cancelled one as neither. */
export type MatrixSummary = {
  cells: number;
  runs: number;
  passed: number;
  failed: number;
  cancelled: number;
};

/** Bounded workers pull cells from the iterator; no Cartesian job array is allocated. */
export function runMatrix(
  matrix: EvalMatrix,
  options: Omit<RunEvalOptions, 'runId' | 'parameters' | 'matrix'> & {
    selection?: MatrixSelection;
    /** The suite each cell's run is recorded under, when `suiteId` is not given. */
    suiteFor?: (cell: EvalMatrixCell) => string | undefined;
    onResult?: (
      cell: EvalMatrixCell,
      runs: readonly RunResult[],
    ) => void | Promise<void>;
  },
): Effect.Effect<MatrixSummary, unknown> {
  return Effect.gen(function* () {
    const concurrency = options.concurrency ?? 4;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1)
      throw new Error('Concurrency must be a positive integer');
    const count = matrix.count(options.selection);
    const iterator = matrix.cells(options.selection);
    const summary: MatrixSummary = {
      cells: 0,
      runs: 0,
      passed: 0,
      failed: 0,
      cancelled: 0,
    };
    yield* Effect.all(
      Array.from({ length: Math.min(count, concurrency) }, () =>
        Effect.gen(function* () {
          while (!options.signal?.aborted) {
            const next = iterator.next();
            if (next.done) return;
            const cell = next.value;
            const runtime =
              options.runtime ??
              (['local', 'remote', 'sandbox'] as const).find(
                (name) => agentRuntimes(cell.eval.agent)[name],
              );
            const suiteId = options.suiteId ?? options.suiteFor?.(cell);
            const runs = yield* runEval(cell.eval, {
              ...options,
              ...(suiteId ? { suiteId } : {}),
              concurrency: 1,
              runtime,
              parameters: cell.parameters,
              matrix: { id: matrix.id, cellKey: cell.key },
            });
            summary.cells++;
            for (const run of runs) {
              summary.runs++;
              if (run.status === 'cancelled') summary.cancelled++;
              else if (run.status === 'passed') summary.passed++;
              else summary.failed++;
            }
            if (options.onResult)
              yield* Effect.tryPromise(async () =>
                options.onResult!(cell, runs),
              );
          }
        }),
      ),
      { concurrency },
    );
    return summary;
  });
}
