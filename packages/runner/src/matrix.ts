import { Effect } from 'effect';
import type { EvalMatrix, EvalMatrixCell, MatrixSelection, RunResult } from '@evalkit/core';
import { runEval, type RunEvalOptions } from './index.js';

/** Bounded workers pull cells from the iterator; no Cartesian job array is allocated. */
export function runMatrix(matrix: EvalMatrix, options: Omit<RunEvalOptions, 'runId' | 'trialId' | 'parameters' | 'matrix'> & {
  selection?: MatrixSelection;
  onResult?: (cell: EvalMatrixCell, result: RunResult) => void | Promise<void>;
}): Effect.Effect<{ cells: number; passed: number; failed: number }, unknown> {
  return Effect.gen(function* () {
    const concurrency = options.concurrency ?? 4;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Concurrency must be a positive integer');
    const count = matrix.count(options.selection);
    const iterator = matrix.cells(options.selection);
    const summary = { cells: 0, passed: 0, failed: 0 };
    yield* Effect.all(Array.from({ length: Math.min(count, concurrency) }, () => Effect.gen(function* () {
      while (true) {
        const next = iterator.next();
        if (next.done) return;
        const cell = next.value;
        const runtime = options.runtime ?? (['local', 'remote', 'sandbox'] as const).find(name => cell.eval.agent.runtimes?.[name]);
        const result = yield* runEval(cell.eval, { ...options, concurrency: 1, runtime,
          parameters: cell.parameters, matrix: { uri: matrix.uri, cellKey: cell.key } });
        summary.cells++;
        if (result.status === 'completed' && (result.aggregateScoring?.passRate === 1 || result.scoring?.passed)) summary.passed++;
        else summary.failed++;
        if (options.onResult) yield* Effect.tryPromise(async () => options.onResult!(cell, result));
      }
    })), { concurrency });
    return summary;
  });
}
