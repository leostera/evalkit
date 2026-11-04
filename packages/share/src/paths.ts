const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_JSON = /^(detail|transcript|artifacts|workspace)\.json$/;
const V2_RUN_JSON = /^(detail|events|artifacts|workspace)\.json$/;
const RUN_FILE = /^(?:workspace|attachments)\/(.+)$/;
const LEGACY_TRIAL_JSON =
  /^trials\/([^/]+)\/(detail|events|artifacts|workspace)\.json$/;
const LEGACY_TRIAL_FILE = /^trials\/([^/]+)\/(?:workspace|attachments)\/(.+)$/;

export const isUuid = (value: string) => UUID.test(value);
export const isSha = (value: string) => /^[0-9a-f]{40}$/.test(value);

/** One path segment that cannot escape or alias another location. */
export function safeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment.length <= 255 &&
    segment !== '.' &&
    segment !== '..' &&
    !/[\\/\0]/.test(segment)
  );
}

/**
 * The only files a run bundle may contain (snapshot format version 3, from
 * `evalkit share`, for one run): its JSON, candidate workspace files and
 * attachments. Never evaluator workspaces. Version 2 (EvalKit 0.9 and
 * 0.10) has `events.json` where version 3 has `transcript.json`.
 */
export function allowedRunPath(path: string, version: 2 | 3 = 3): boolean {
  if (
    path === 'run.json' ||
    path === 'catalog.json' ||
    (version === 3 ? RUN_JSON : V2_RUN_JSON).test(path)
  )
    return true;
  const file = RUN_FILE.exec(path);
  return Boolean(file && file[1]!.split('/').every(safeSegment));
}

/** The same for snapshot format version 1 (EvalKit before 0.9): a run of trials. */
export function allowedLegacyRunPath(path: string): boolean {
  if (path === 'run.json' || path === 'catalog.json' || path === 'trials.json')
    return true;
  const json = LEGACY_TRIAL_JSON.exec(path);
  if (json) return isUuid(json[1]!);
  const file = LEGACY_TRIAL_FILE.exec(path);
  return Boolean(
    file && isUuid(file[1]!) && file[2]!.split('/').every(safeSegment),
  );
}

/**
 * Repository key: normalized host/path, plus `/~<project>` for an eval
 * project below the repository root. Used in storage keys and URLs.
 */
export function repoKey(source: { repo: string; project: string }): string {
  return source.project ? `${source.repo}/~${source.project}` : source.repo;
}

export function validRepoKey(key: string): boolean {
  const segments = key.split('/');
  return (
    segments.length >= 2 &&
    !segments.includes('-') &&
    segments.every(safeSegment)
  );
}
