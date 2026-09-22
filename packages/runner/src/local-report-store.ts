import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as Schema from 'effect/Schema';
import {
  RunMetadataSchema,
  RunSummarySchema,
  TrialMetadataSchema,
} from '@evalkit/core';
import type {
  ReportStore,
  RunMetadata,
  RunSummary,
  RunWriter,
  TrialMetadata,
  TrialScoring,
  TrialSummary,
  TrialWriter,
  TrajectoryEvent,
} from '@evalkit/core';

const MANIFEST_FILE = 'manifest.json';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

class LocalTrialWriter implements TrialWriter {
  constructor(private readonly directory: string) {}

  appendEvent(event: TrajectoryEvent): Promise<void> {
    return appendFile(
      path.join(this.directory, 'trajectory.jsonl'),
      `${JSON.stringify(event)}\n`,
    );
  }

  writeScores(scoring: TrialScoring): Promise<void> {
    return writeJson(path.join(this.directory, 'scoring.json'), scoring);
  }

  async writeArtifact(relativePath: string, data: Uint8Array): Promise<void> {
    const target = artifactPath(
      path.join(this.directory, 'artifacts'),
      relativePath,
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async finalize(summary: TrialSummary): Promise<void> {
    await writeJson(path.join(this.directory, 'summary.json'), summary);
  }
}

class LocalRunWriter implements RunWriter {
  constructor(
    readonly location: string,
    private readonly directory: string,
  ) {}

  async startTrial(metadata: TrialMetadata): Promise<TrialWriter> {
    assertPathSegment(metadata.trialId, 'trialId');
    const directory = path.join(this.directory, 'trials', metadata.trialId);
    await mkdir(directory, { recursive: true });
    await writeJson(path.join(directory, MANIFEST_FILE), {
      ...Schema.encodeSync(TrialMetadataSchema)(metadata),
      status: 'running',
    });
    return new LocalTrialWriter(directory);
  }

  finalize(summary: RunSummary): Promise<void> {
    return writeJson(
      path.join(this.directory, 'summary.json'),
      Schema.encodeSync(RunSummarySchema)(summary),
    );
  }
}

/** Persists each run as a local tree rooted below `rootDirectory`. */
export function localReportStore(rootDirectory: string): ReportStore {
  return {
    async startRun(metadata: RunMetadata): Promise<RunWriter> {
      assertPathSegment(metadata.runId, 'runId');
      const directory = path.resolve(rootDirectory, metadata.runId);
      await mkdir(directory, { recursive: true });
      await writeJson(path.join(directory, MANIFEST_FILE), {
        ...Schema.encodeSync(RunMetadataSchema)(metadata),
        status: 'running',
      });
      return new LocalRunWriter(
        path.relative(process.cwd(), directory),
        directory,
      );
    },
  };
}
