import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ArtifactView,
  AutContext,
  Fixture,
  FixtureContext,
  FixtureVisibility,
} from '@evalkit/core';

const MAX_DYNAMIC_FIXTURE_DEPTH = 16;

export type TrialWorkspace = {
  artifacts: ArtifactView;
  cleanup(): Promise<void>;
};

function workspaceRoot(
  visibility: FixtureVisibility,
  artifacts: ArtifactView,
): string {
  return visibility === 'candidate'
    ? artifacts.candidate.root
    : artifacts.evaluator.root;
}

function destinationPath(root: string, destination: string): string {
  if (!destination || path.isAbsolute(destination)) {
    throw new Error(
      `Fixture destination must be a non-empty relative path: ${destination}`,
    );
  }

  const normalized = path.normalize(destination);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(
      `Fixture destination escapes its workspace: ${destination}`,
    );
  }

  return path.join(root, normalized);
}

async function resolveFixtures(
  fixtures: readonly Fixture[],
  context: FixtureContext,
  depth = 0,
): Promise<Exclude<Fixture, { kind: 'dynamic' }>[]> {
  if (depth > MAX_DYNAMIC_FIXTURE_DEPTH) {
    throw new Error('Dynamic fixture nesting exceeds the supported depth');
  }

  const resolved: Exclude<Fixture, { kind: 'dynamic' }>[] = [];
  for (const fixture of fixtures) {
    if (fixture.kind !== 'dynamic') {
      resolved.push(fixture);
      continue;
    }

    const created = await fixture.create(context);
    const nested = Array.isArray(created) ? created : [created];
    resolved.push(...(await resolveFixtures(nested, context, depth + 1)));
  }
  return resolved;
}

function assertUniqueDestinations(
  fixtures: readonly Exclude<Fixture, { kind: 'dynamic' }>[],
): void {
  const destinations = new Set<string>();
  for (const fixture of fixtures) {
    const destination = fixture.kind === 'inline' ? fixture.file : fixture.dst;
    const key = `${fixture.visibility}:${destination}`;
    if (destinations.has(key)) {
      throw new Error(
        `Duplicate ${fixture.visibility} fixture destination: ${destination}`,
      );
    }
    destinations.add(key);
  }
}

/** Creates isolated candidate and evaluator directories and materializes fixtures into each. */
function evalDirectoryName(evalId: string): string {
  const value = evalId.split(':').at(-1) ?? evalId;
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function createTrialWorkspace(
  context: FixtureContext,
  fixtures: readonly Fixture[] = [],
  persistentRoot?: string,
): Promise<TrialWorkspace> {
  const root = persistentRoot
    ? path.join(
        path.resolve(persistentRoot),
        evalDirectoryName(context.evalId),
        `${context.runId}-${context.trialId}`,
      )
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

    const resolved = await resolveFixtures(fixtures, context);
    assertUniqueDestinations(resolved);

    for (const fixture of resolved) {
      const target = destinationPath(
        workspaceRoot(fixture.visibility, artifacts),
        fixture.kind === 'inline' ? fixture.file : fixture.dst,
      );
      await mkdir(path.dirname(target), { recursive: true });

      if (fixture.kind === 'directory') {
        await cp(fixture.src, target, {
          recursive: true,
          force: false,
          errorOnExist: true,
        });
      } else if (fixture.kind === 'file') {
        await copyFile(fixture.src, target);
      } else {
        await writeFile(target, fixture.data);
      }
    }

    return {
      artifacts,
      // Persistent local workspaces are intentionally retained for debugging.
      cleanup: persistent ? async () => {} : () => rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

/** Exposed for adapters that need the candidate workspace capability from an AUT context. */
export function candidateWorkspace(context: AutContext): string {
  return context.workspace.root;
}
