import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactEntry, TrialWriter } from '@evalkit/core';

/**
 * Copies every regular file in the candidate workspace into the trial report.
 * Symbolic links are rejected so snapshots cannot follow paths outside the trial.
 */
export async function snapshotCandidateWorkspace(
  candidateRoot: string,
  writer: TrialWriter,
): Promise<ArtifactEntry[]> {
  const artifacts: ArtifactEntry[] = [];

  async function visit(
    directory: string,
    relativeDirectory: string,
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name);
      const stat = await lstat(absolutePath);

      if (stat.isSymbolicLink()) {
        throw new Error(
          `Candidate workspace contains a symbolic link: ${relativePath}`,
        );
      }
      if (stat.isDirectory()) {
        artifacts.push({
          path: path.join('candidate', relativePath),
          kind: 'directory',
        });
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(
          `Candidate workspace contains an unsupported entry: ${relativePath}`,
        );
      }

      const data = await readFile(absolutePath);
      const artifactPath = path.join('candidate', relativePath);
      await writer.writeArtifact(artifactPath, data);
      artifacts.push({
        path: artifactPath,
        kind: 'file',
        size: data.byteLength,
      });
    }
  }

  await visit(candidateRoot, '');
  return artifacts;
}
