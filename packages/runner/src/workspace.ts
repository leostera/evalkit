import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArtifactView, AutContext } from '@evalkit/core';
import {
  listFiles,
  type PreparedDataset,
  type PreparedFile,
} from './datasets.js';

export type TrialWorkspace = {
  artifacts: ArtifactView;
  /** Removes the workspace; a persistent one survives when `keep` is true. */
  cleanup(keep?: boolean): Promise<void>;
};

/** Where a trial's persistent workspace lives below `root`. */
export function trialWorkspacePath(root: string, trialId: string): string {
  return path.join(
    path.resolve(root),
    trialId.replace(/[^a-zA-Z0-9._-]/g, '_'),
  );
}

/**
 * Creates isolated candidate and evaluator directories and writes each
 * dataset's files below its mount, on the side its visibility allows.
 * Two datasets writing the same file is an error, never an overwrite.
 */
export async function createTrialWorkspace(
  trialId: string,
  datasets: readonly PreparedDataset[] = [],
  persistentRoot?: string,
): Promise<TrialWorkspace> {
  const root = persistentRoot
    ? trialWorkspacePath(persistentRoot, trialId)
    : await mkdtemp(path.join(os.tmpdir(), 'evalkit-trial-'));
  const persistent = persistentRoot !== undefined;
  const artifacts: ArtifactView = {
    candidate: { root: path.join(root, 'candidate') },
    evaluator: { root: path.join(root, 'evaluator') },
  };

  try {
    await Promise.all([
      mkdir(artifacts.candidate.root, { recursive: true }),
      mkdir(artifacts.evaluator.root, { recursive: true }),
    ]);
    for (const prepared of datasets) {
      const side =
        prepared.dataset.visibility === 'candidate'
          ? artifacts.candidate.root
          : artifacts.evaluator.root;
      await writeDatasetFiles(
        prepared,
        path.join(side, prepared.dataset.mount),
      );
    }
    return {
      artifacts,
      // Persistent local workspaces may be kept for debugging; temporary ones never are.
      cleanup: async (keep = false) => {
        if (persistent && keep) return;
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function writeDatasetFiles(
  prepared: PreparedDataset,
  target: string,
): Promise<void> {
  const { files, dataset } = prepared;
  if (files.kind === 'none') return;
  await mkdir(target, { recursive: true });
  // Copied file by file so a collision with another dataset is reported, never merged.
  const entries: PreparedFile[] =
    files.kind === 'directory'
      ? (await listFiles(files.source)).map((file) => ({
          path: file,
          kind: 'file',
          source: path.join(files.source, file),
        }))
      : files.entries;
  for (const entry of entries) await writeEntry(dataset.id, target, entry);
}

async function writeEntry(
  datasetId: string,
  target: string,
  entry: PreparedFile,
): Promise<void> {
  const destination = path.join(target, ...entry.path.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  const write =
    entry.kind === 'bytes'
      ? writeFile(destination, entry.data, { flag: 'wx' })
      : copyFile(entry.source, destination, 1 /* COPYFILE_EXCL */);
  await write.catch((cause: unknown) => {
    throw collision(datasetId, entry.path, cause);
  });
}

function collision(datasetId: string, file: string, cause: unknown): Error {
  const code = (cause as { code?: unknown }).code;
  return code === 'EEXIST'
    ? new Error(
        `Dataset ${datasetId} would overwrite ${file}, which another dataset already wrote`,
      )
    : cause instanceof Error
      ? cause
      : new Error(String(cause));
}

/** Exposed for adapters that need the candidate workspace capability from an AUT context. */
export function candidateWorkspace(context: AutContext): string {
  return context.workspace.root;
}
