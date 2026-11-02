import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as Schema from 'effect/Schema';
import {
  RunMetadataSchema,
  RunScoringSchema,
  RunSummarySchema,
  TrajectoryEventSchema,
} from '@evalkit/core';
import type {
  ReportStore,
  RunMetadata,
  RunScoring,
  RunSummary,
  RunWriter,
  TrajectoryEvent,
} from '@evalkit/core';

const MANIFEST_FILE = 'manifest.json';
/** The project's evals and suites when the run started. */
export const CATALOG_FILE = 'catalog.json';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function replaceJson(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeJson(temporary, value);
  await rename(temporary, filePath);
}

function assertPathSegment(value: string, name: string): void {
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new Error(`${name} must be a single relative path segment`);
  }
}

function artifactPath(root: string, value: string): string {
  if (!value || path.isAbsolute(value)) {
    throw new Error(
      `Artifact path must be a non-empty relative path: ${value}`,
    );
  }
  const normalized = path.normalize(value);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Artifact path escapes its root: ${value}`);
  }
  return path.join(root, normalized);
}

class LocalRunWriter implements RunWriter {
  constructor(
    readonly location: string,
    private readonly directory: string,
    private readonly metadata: RunMetadata,
  ) {}

  appendEvent(event: TrajectoryEvent): Promise<void> {
    return appendFile(
      path.join(this.directory, 'trajectory.jsonl'),
      `${JSON.stringify(Schema.encodeSync(TrajectoryEventSchema)(event))}\n`,
    );
  }

  writeScores(scoring: RunScoring): Promise<void> {
    return writeJson(
      path.join(this.directory, 'scoring.json'),
      Schema.encodeSync(RunScoringSchema)(scoring),
    );
  }

  async writeArtifact(relativePath: string, data: Uint8Array): Promise<void> {
    const target = artifactPath(
      path.join(this.directory, 'artifacts'),
      relativePath,
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async finalize(summary: RunSummary): Promise<void> {
    await writeJson(
      path.join(this.directory, 'summary.json'),
      Schema.encodeSync(RunSummarySchema)(summary),
    );
    await replaceJson(path.join(this.directory, MANIFEST_FILE), {
      ...Schema.encodeSync(RunMetadataSchema)(this.metadata),
      status: summary.status,
    });
  }
}

/** Persists each run as a local tree rooted below `rootDirectory`. */
export function localReportStore(rootDirectory: string): ReportStore {
  return {
    async startRun(metadata, context): Promise<RunWriter> {
      assertPathSegment(metadata.runId, 'runId');
      const directory = path.resolve(rootDirectory, metadata.runId);
      await mkdir(directory, { recursive: true });
      if (context?.catalog)
        await writeJson(path.join(directory, CATALOG_FILE), context.catalog);
      await writeJson(path.join(directory, MANIFEST_FILE), {
        ...Schema.encodeSync(RunMetadataSchema)(metadata),
        status: 'running',
      });
      return new LocalRunWriter(
        path.relative(process.cwd(), directory),
        directory,
        metadata,
      );
    },
  };
}
