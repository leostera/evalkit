import type { FixtureAddress, Isolation, Shell } from '@evalkit/core';
import { containerShell } from './container-shell.js';
import type { FixtureSet } from './fixtures.js';
import { hostShell } from './host-shell.js';
import { sandboxShell } from './sandbox-shell.js';

export { fixtureSet, type FixtureSet } from './fixtures.js';
export { removeRunContainer } from './container-shell.js';

/** A run's shell, and how to end it. */
export type RunShell = {
  shell: Shell;
  fixtures: Record<string, FixtureAddress>;
  /** Stops its processes; `keep` keeps a container (stopped) for a run that did not pass. */
  close(options: { keep: boolean }): Promise<void>;
};

/**
 * Opens a run's shell where its isolation puts it, starting the project's
 * fixtures first when there are any.
 */
export async function openRunShell(options: {
  isolation: Isolation;
  runId: string;
  /** The candidate workspace on the host. */
  root: string;
  projectRoot: string;
  signal: AbortSignal;
  fixtures?: FixtureSet;
}): Promise<RunShell> {
  const { isolation } = options;
  await options.fixtures?.ensure();
  const fixtures = options.fixtures?.addresses(isolation) ?? {};
  if (isolation.kind === 'container') {
    const fixturesNetwork =
      isolation.network === 'fixtures' && options.fixtures
        ? await options.fixtures.network(isolation.runtime)
        : undefined;
    const shell = await containerShell({
      isolation,
      runId: options.runId,
      root: options.root,
      projectRoot: options.projectRoot,
      signal: options.signal,
      ...(fixturesNetwork ? { fixturesNetwork } : {}),
    });
    return { shell, fixtures, close: ({ keep }) => shell.close({ keep }) };
  }
  const shell =
    isolation.kind === 'sandbox-exec'
      ? await sandboxShell({
          isolation,
          root: options.root,
          projectRoot: options.projectRoot,
          signal: options.signal,
        })
      : hostShell({ root: options.root, signal: options.signal });
  return { shell, fixtures, close: () => shell.close() };
}
