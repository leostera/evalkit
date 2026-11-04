import type { EvalkitConfig } from '@evalkit/core';
import { parseLimits } from '@evalkit/core/limits';
import {
  fixtureSet,
  sandboxSet,
  type FixtureSet,
  type RunEvalOptions,
  type SandboxSet,
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
  | 'sandboxes'
  | 'sandbox'
  | 'limits'
  | 'keepWorkspaces'
  | 'artifactExclude'
  | 'attachmentLimits'
  | 'judge'
> {
  return {
    root,
    ...(config?.sandboxes ? { sandboxes: config.sandboxes } : {}),
    ...(config?.sandbox !== undefined ? { sandbox: config.sandbox } : {}),
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

/** The container runtime of each container sandbox the project names, by id. */
export function containerRuntimes(
  config: EvalkitConfig | undefined,
): Record<string, string> {
  const runtimes: Record<string, string> = {};
  const sandboxes = [
    ...Object.values(config?.sandboxes ?? {}),
    ...(typeof config?.sandbox === 'object' ? [config.sandbox] : []),
  ];
  for (const sandbox of sandboxes)
    if (sandbox.kind === 'container') runtimes[sandbox.id] = sandbox.runtime;
  return runtimes;
}

/** What one invocation's runs share: the project's fixtures and its sandboxes. */
export type RunResources = { fixtures?: FixtureSet; sandboxSet: SandboxSet };

/**
 * Runs `work` with the invocation's fixtures and sandboxes, then tears the
 * sandboxes down and stops the fixtures.
 */
export async function withRunResources<T>(
  root: string,
  config: EvalkitConfig | undefined,
  work: (resources: RunResources) => Promise<T>,
): Promise<T> {
  const fixtures = projectFixtures(root, config);
  const sandboxes = sandboxSet({ root });
  try {
    return await work({
      ...(fixtures ? { fixtures } : {}),
      sandboxSet: sandboxes,
    });
  } finally {
    try {
      await sandboxes.teardown();
    } finally {
      await fixtures?.stop();
    }
  }
}
