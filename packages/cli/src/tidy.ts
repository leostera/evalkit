import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { authoringId, type EvalRegistry } from '@evalkit/core';
import {
  ARCHIVE_MARKER,
  createDashboardReportReader,
} from './dashboard-reports.js';

export type TidyResult = {
  /** Runs newly archived because their eval left the project. */
  archived: { runId: string; evalId: string }[];
  /** Previously archived runs whose eval is back in the project. */
  restored: { runId: string; evalId: string }[];
  /** Runs left archived from an earlier tidy. */
  stillArchived: number;
  /** Runs whose eval is still in the project. */
  current: number;
};

/**
 * Every eval the project can run: standalone, in suites, or only in matrices.
 * A run is archived only when its eval is in none of these.
 */
export function projectEvalIds(registry: EvalRegistry): Set<string> {
  return new Set(
    [
      ...registry.evals,
      ...registry.suites.flatMap((suite) => suite.evals),
      ...registry.matrices.flatMap((matrix) => matrix.evals),
    ].map(authoringId),
  );
}

/**
 * Mark runs of removed evals as archived, and restore runs whose eval returned.
 * Reports are never deleted: archiving writes a marker file beside the manifest.
 */
export async function tidyReports(options: {
  registry: EvalRegistry;
  reportRoot: string;
}): Promise<TidyResult> {
  const known = projectEvalIds(options.registry);
  const reports = createDashboardReportReader(
    options.reportRoot,
    options.registry,
  );
  const result: TidyResult = {
    archived: [],
    restored: [],
    stillArchived: 0,
    current: 0,
  };
  for (const run of await reports.listRuns()) {
    const marker = resolve(options.reportRoot, run.id, ARCHIVE_MARKER);
    const entry = { runId: run.id, evalId: run.evalId };
    if (known.has(run.evalId)) {
      result.current += 1;
      if (run.archived) {
        await rm(marker, { force: true });
        result.restored.push(entry);
      }
    } else if (run.archived) {
      result.stillArchived += 1;
    } else {
      await writeFile(
        marker,
        `${JSON.stringify({
          archivedAt: new Date().toISOString(),
          reason: `Eval "${run.evalId}" is no longer in the project`,
        })}\n`,
      );
      result.archived.push(entry);
    }
  }
  return result;
}
