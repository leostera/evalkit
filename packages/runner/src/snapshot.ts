import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_ARTIFACT_EXCLUDE,
  type ArtifactEntry,
  type TrialWriter,
} from '@evalkit/core';
import { globMatcher } from '@evalkit/core/glob';

/** A pattern without `/` matches a name at any depth, like `.gitignore`. */
export function excludeMatcher(
  patterns: readonly string[],
): (relativePath: string) => boolean {
  const matchers = patterns.map((pattern) => {
    const trimmed = pattern.replace(/^\.\//, '').replace(/\/$/, '');
    const match = globMatcher(trimmed);
    return trimmed.includes('/')
      ? match
      : (relativePath: string) => match(path.posix.basename(relativePath));
  });
  return (relativePath) => matchers.some((match) => match(relativePath));
}

/**
 * Copies the candidate workspace's regular files into the trial report,
 * leaving out excluded paths. Symbolic links and special files are skipped,
 * never followed, so a snapshot cannot read outside the trial.
 */
export async function snapshotCandidateWorkspace(
  candidateRoot: string,
  writer: TrialWriter,
  exclude: readonly string[] = DEFAULT_ARTIFACT_EXCLUDE,
): Promise<ArtifactEntry[]> {
  const artifacts: ArtifactEntry[] = [];
  const excluded = excludeMatcher(exclude);

  async function visit(
    directory: string,
    relativeDirectory: string,
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name);
      if (excluded(relativePath.split(path.sep).join('/'))) continue;
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        artifacts.push({
          path: path.join('candidate', relativePath),
          kind: 'directory',
        });
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!stat.isFile()) continue;

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
