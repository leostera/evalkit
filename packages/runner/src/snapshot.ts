import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_ARTIFACT_EXCLUDE,
  type ArtifactEntry,
  type TrialWriter,
} from '@evalkit/core';
import { globMatcher } from '@evalkit/core/glob';

type IgnoreRule = {
  negated: boolean;
  match: (relativePath: string) => boolean;
  /** For a negated rule: could it match something below this directory? */
  mayMatchBelow: (directory: string) => boolean;
};

const GLOB_CHARS = /[*?{]/;

function ignoreRule(pattern: string): IgnoreRule {
  const negated = pattern.startsWith('!');
  const trimmed = (negated ? pattern.slice(1) : pattern)
    .replace(/^\.\//, '')
    .replace(/\/$/, '');
  const match = globMatcher(trimmed);
  if (!trimmed.includes('/'))
    return {
      negated,
      match: (relativePath) => match(path.posix.basename(relativePath)),
      // A bare name matches at any depth.
      mayMatchBelow: () => true,
    };
  // The literal directories before the first glob, e.g. `_build/doc` for `_build/doc/**`.
  const segments = trimmed.split('/');
  const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
  const prefix = segments
    .slice(0, firstGlob === -1 ? segments.length : firstGlob)
    .join('/');
  return {
    negated,
    match,
    mayMatchBelow: (directory) =>
      prefix === '' ||
      prefix.startsWith(`${directory}/`) ||
      prefix === directory ||
      directory.startsWith(`${prefix}/`),
  };
}

/**
 * Ignore rules for candidate snapshots, read like `.gitignore`: globs relative
 * to the workspace root, where a pattern without `/` matches that name at any
 * depth, and later patterns win. `!pattern` re-includes a path; unlike Git, it
 * also works below an ignored directory (`_build` then `!_build/doc/**`).
 */
export function ignoreRules(patterns: readonly string[]) {
  const rules = patterns.map(ignoreRule);
  return {
    /** Whether a path is ignored, given whether its directory was. */
    ignored(relativePath: string, parentIgnored = false): boolean {
      let ignored = parentIgnored;
      for (const rule of rules)
        if (rule.match(relativePath)) ignored = !rule.negated;
      return ignored;
    },
    /** Whether an ignored directory must still be walked for re-included paths. */
    mayReinclude(directory: string): boolean {
      return rules.some(
        (rule) => rule.negated && rule.mayMatchBelow(directory),
      );
    },
  };
}

/**
 * Copies the candidate workspace's regular files into the trial report,
 * leaving out ignored paths. Symbolic links and special files are skipped,
 * never followed, so a snapshot cannot read outside the trial. An ignored
 * directory is walked only when a `!` pattern could re-include something in
 * it, and is listed only if it ends up containing a snapshotted file.
 */
export async function snapshotCandidateWorkspace(
  candidateRoot: string,
  writer: TrialWriter,
  ignore: readonly string[] = DEFAULT_ARTIFACT_EXCLUDE,
): Promise<ArtifactEntry[]> {
  const artifacts: ArtifactEntry[] = [];
  const rules = ignoreRules(ignore);

  /** Returns whether anything below `directory` was snapshotted. */
  async function visit(
    directory: string,
    relativeDirectory: string,
    directoryIgnored: boolean,
  ): Promise<boolean> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    let kept = false;

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name);
      const posixPath = relativePath.split(path.sep).join('/');
      const ignored = rules.ignored(posixPath, directoryIgnored);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (ignored && !rules.mayReinclude(posixPath)) continue;
        const entryIndex = artifacts.length;
        const keptBelow = await visit(absolutePath, relativePath, ignored);
        if (!ignored || keptBelow) {
          artifacts.splice(entryIndex, 0, {
            path: path.join('candidate', relativePath),
            kind: 'directory',
          });
          kept = true;
        }
        continue;
      }
      if (ignored || !stat.isFile()) continue;

      const data = await readFile(absolutePath);
      const artifactPath = path.join('candidate', relativePath);
      await writer.writeArtifact(artifactPath, data);
      artifacts.push({
        path: artifactPath,
        kind: 'file',
        size: data.byteLength,
      });
      kept = true;
    }
    return kept;
  }

  await visit(candidateRoot, '', false);
  return artifacts;
}
