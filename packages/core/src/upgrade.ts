/**
 * Pure conversions from results written before report schema version 6,
 * where a run held trials, to version 6, where each trial is a run (RFD0008).
 * Shared by `evalkit upgrade` and the share server, so both upgrade the same
 * way. No dependencies: the share server's Worker bundles this file.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonRecord = { [key: string]: Json };

/** Report schema versions `evalkit upgrade` converts. */
export const UPGRADABLE_SCHEMA_VERSIONS: readonly number[] = [2, 3, 4, 5];

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A version 6 run status from an old trial's status and whether it passed.
 * Old `completed` meant "finished", passed or not; old `failed` meant it
 * could not finish, which version 6 calls `errored`.
 */
export function upgradeStatus(
  status: unknown,
  passed: boolean | undefined,
): 'running' | 'passed' | 'failed' | 'errored' | 'cancelled' {
  switch (status) {
    case 'completed':
      return passed ? 'passed' : 'failed';
    case 'failed':
      return 'errored';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

/** A trajectory event with the old trial lifecycle events renamed. */
export function upgradeEvent<T>(event: T): T {
  if (!isRecord(event)) return event;
  if (event.kind === 'trial-started')
    return { ...event, kind: 'run-started' } as T;
  if (event.kind === 'trial-completed')
    return { ...event, kind: 'run-completed' } as T;
  return event;
}

/** A whole `trajectory.jsonl`, line by line; lines that are not JSON stay as they are. */
export function upgradeTrajectory(jsonl: string): string {
  return jsonl
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line;
      try {
        return JSON.stringify(upgradeEvent(JSON.parse(line)));
      } catch {
        return line;
      }
    })
    .join('\n');
}

/**
 * A catalog (`catalog.json`, or its `catalog` list on its own) with each
 * scenario's `trialCount` and `policy.trials` replaced by `repeat`.
 */
export function upgradeCatalog<T>(catalog: T): T {
  const entry = (value: Json): Json => {
    if (!isRecord(value)) return value;
    const { trialCount, policy, ...rest } = value;
    const { trials, ...keptPolicy } = isRecord(policy) ? policy : {};
    const repeat =
      typeof trialCount === 'number'
        ? trialCount
        : typeof trials === 'number'
          ? trials
          : value.repeat;
    return {
      ...rest,
      ...(repeat === undefined ? {} : { repeat }),
      ...(isRecord(policy) ? { policy: keptPolicy } : {}),
    };
  };
  if (Array.isArray(catalog)) return catalog.map(entry) as T;
  if (isRecord(catalog) && Array.isArray(catalog.catalog))
    return { ...catalog, catalog: catalog.catalog.map(entry) } as T;
  return catalog;
}

/** The fields of an old run manifest and trial manifest that a version 6 manifest keeps. */
export function upgradeManifest(input: {
  run: Record<string, unknown>;
  trial?: Record<string, unknown>;
  runId: string;
  batch?: { id: string; index: number; size: number };
  status: string;
}): Record<string, unknown> {
  const { run, trial = {}, runId, batch, status } = input;
  const pick = (source: Record<string, unknown>, keys: readonly string[]) =>
    Object.fromEntries(
      keys.flatMap((key) =>
        source[key] === undefined ? [] : [[key, source[key]]],
      ),
    );
  return {
    schemaVersion: 6,
    runUri: `evalkit:run:${runId}`,
    ...pick(run, [
      'evalId',
      'suiteId',
      'parameters',
      'matrix',
      'aut',
      'startedAt',
      'source',
      'process',
    ]),
    ...pick(trial, [
      'evalId',
      'parameters',
      'matrix',
      'aut',
      'startedAt',
      'workspaceIgnore',
      'datasets',
    ]),
    ...(batch ? { batch } : {}),
    status,
  };
}

/**
 * Scenario options from before 0.9 that plain JavaScript scenarios can still
 * carry. Ignoring them would silently change what runs, so both
 * `defineEval` and the runner reject them with the replacement.
 */
export function assertNoRemovedOptions(definition: {
  id?: unknown;
  policy?: unknown;
}): void {
  if ('fixtures' in definition)
    throw new Error(
      `Eval ${String(definition.id)} uses fixtures, which were replaced by datasets: [defineDataset(...)]`,
    );
  if ('judge' in definition)
    throw new Error(
      `Eval ${String(definition.id)} sets judge, which moved to each rule: judge(name, { agent, rubric }), or judge in evalkit.config.ts for every judge (EvalKit 0.10)`,
    );
  if (isRecord(definition.policy) && 'trials' in definition.policy)
    throw new Error(
      `Eval ${String(definition.id)} sets policy.trials, which was replaced by repeat: ${JSON.stringify(definition.policy.trials)} (EvalKit 0.9)`,
    );
}
