import type { EvalkitConfig } from '@evalkit/core';
import { parseLimits } from '@evalkit/core/limits';
import {
  fixtureSet,
  type FixtureSet,
  type RunEvalOptions,
} from '@evalkit/runner';

/**
 * What every run of the project shares, from its config, wherever it is
 * launched: the CLI's `run` and the dashboard's buttons.
 */
export function projectRunOptions(
  root: string,
  config: EvalkitConfig | undefined,
): Pick<
  RunEvalOptions,
  | 'root'
  | 'isolation'
  | 'limits'
  | 'keepWorkspaces'
  | 'artifactExclude'
  | 'attachmentLimits'
  | 'judge'
> {
  return {
    root,
    ...(config?.isolation ? { isolation: config.isolation } : {}),
    limits: { base: parseLimits(config?.limits, 'The config') },
    ...(config?.keepSandboxes ? { keepWorkspaces: config.keepSandboxes } : {}),
    ...(config?.artifacts?.exclude
      ? { artifactExclude: config.artifacts.exclude }
      : {}),
    ...(config?.artifacts?.attachments
      ? { attachmentLimits: config.artifacts.attachments }
      : {}),
    ...(config?.judge ? { judge: config.judge } : {}),
  };
}

/**
 * The project's fixtures for one invocation, or undefined when it has
 * none. The caller stops them when its runs are done.
 */
export function projectFixtures(
  root: string,
  config: EvalkitConfig | undefined,
): FixtureSet | undefined {
  const fixtures = config?.fixtures;
  if (!fixtures || !Object.keys(fixtures).length) return undefined;
  return fixtureSet(fixtures, { root });
}

/** Runs `work` with the project's fixtures, stopping them afterwards. */
export async function withFixtures<T>(
  root: string,
  config: EvalkitConfig | undefined,
  work: (fixtures: FixtureSet | undefined) => Promise<T>,
): Promise<T> {
  const fixtures = projectFixtures(root, config);
  try {
    return await work(fixtures);
  } finally {
    await fixtures?.stop();
  }
}
