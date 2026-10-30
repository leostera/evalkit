import { authorId } from './identity.js';
import type { JsonObject } from './index.js';

/** Who can see a dataset: the agent (and scorers), or only scorers. */
export type DatasetVisibility = 'candidate' | 'evaluator';

/** Inline text or bytes, or a file relative to the project root. */
export type DatasetFileSource = string | Uint8Array | { file: string };

/**
 * Files for the trial workspace: a directory relative to the project root, or
 * a map from workspace path (below the dataset's mount) to its content.
 */
export type DatasetFiles = string | Readonly<Record<string, DatasetFileSource>>;

/** What one trial receives from a dataset. */
export type DatasetContent = {
  files?: DatasetFiles;
  /** Any JSON-convertible value; converted once when the trial starts. */
  value?: unknown;
};

export type DatasetLoadContext = {
  /** The project root; relative paths in returned content resolve against it. */
  root: string;
  signal: AbortSignal;
};

export type DatasetTrialContext = {
  evalId: string;
  runId: string;
  trialId: string;
  trialIndex: number;
  /** Per-trial random seed, so repeated trials can choose different data. */
  seed: number;
  /** The matrix cell's parameters, or `{}`. */
  parameters: JsonObject;
  signal: AbortSignal;
};

type DatasetCommon = {
  id: string;
  name?: string;
  /** Default `candidate`. */
  visibility?: DatasetVisibility;
  /** Workspace directory for the dataset's files. Default: the dataset ID. `.` is the workspace root. */
  mount?: string;
};

export type StaticDatasetDefinition = DatasetCommon & {
  files?: DatasetFiles;
  /** An inline value. Exclusive with `valueFile`. */
  value?: unknown;
  /** A `.json` file, or a `.jsonl` file read as an array of objects, relative to the project root. */
  valueFile?: string;
  onLoad?: never;
  onRun?: never;
};

export type ComputedDatasetDefinition<TLoaded extends DatasetContent> =
  DatasetCommon & {
    /** Once per process; the successful result is cached and shared by every trial. */
    onLoad: (load: DatasetLoadContext) => TLoaded | Promise<TLoaded>;
    /** Once per trial; defaults to using the loaded content as is. */
    onRun?: (
      loaded: TLoaded,
      trial: DatasetTrialContext,
    ) => DatasetContent | Promise<DatasetContent>;
    files?: never;
    value?: never;
    valueFile?: never;
  };

export type DatasetSource =
  | {
      kind: 'static';
      files?: DatasetFiles;
      value?: unknown;
      valueFile?: string;
    }
  | {
      kind: 'computed';
      onLoad: (
        load: DatasetLoadContext,
      ) => DatasetContent | Promise<DatasetContent>;
      onRun?: (
        loaded: DatasetContent,
        trial: DatasetTrialContext,
      ) => DatasetContent | Promise<DatasetContent>;
    };

/** A checked dataset, as returned by `defineDataset`. Evals accept only these. */
export type Dataset = {
  readonly kind: 'dataset';
  readonly id: string;
  readonly name?: string;
  readonly visibility: DatasetVisibility;
  /** Normalized relative POSIX path; `.` is the workspace root. */
  readonly mount: string;
  readonly source: DatasetSource;
};

/** Normalizes a relative POSIX path and rejects absolute or escaping ones. */
export function relativeDatasetPath(value: string, label: string): string {
  const parts: string[] = [];
  if (!value || value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value))
    throw new Error(`${label} must be a non-empty relative path: ${value}`);
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!parts.length)
        throw new Error(`${label} escapes its workspace: ${value}`);
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length ? parts.join('/') : '.';
}

/**
 * Declares named data that scenarios use: files placed in each trial's
 * workspace, a value for the agent and scorers, or both. Static datasets give
 * `files`, `value` or `valueFile`; computed datasets give `onLoad` (cached per
 * process) and optionally `onRun` (per trial).
 */
export function defineDataset<TLoaded extends DatasetContent>(
  definition: StaticDatasetDefinition | ComputedDatasetDefinition<TLoaded>,
): Dataset {
  if ('uri' in definition || 'uuid' in definition || 'slug' in definition)
    throw new Error('Authored resources use id, not uri, uuid, or slug');
  const id = authorId(definition.id);
  const visibility = definition.visibility ?? 'candidate';
  if (visibility !== 'candidate' && visibility !== 'evaluator')
    throw new Error(
      `Dataset ${id} visibility must be candidate or evaluator; received ${String(visibility)}`,
    );
  const mount = relativeDatasetPath(
    definition.mount ?? id,
    `Dataset ${id} mount`,
  );
  const common = {
    kind: 'dataset' as const,
    id,
    ...(definition.name ? { name: definition.name } : {}),
    visibility,
    mount,
  };

  if (definition.onLoad !== undefined) {
    if (typeof definition.onLoad !== 'function')
      throw new Error(`Dataset ${id} onLoad must be a function`);
    if (
      definition.files !== undefined ||
      definition.value !== undefined ||
      definition.valueFile !== undefined
    )
      throw new Error(
        `Dataset ${id} is computed (onLoad); move files and values into what onLoad returns`,
      );
    if (
      definition.onRun !== undefined &&
      typeof definition.onRun !== 'function'
    )
      throw new Error(`Dataset ${id} onRun must be a function`);
    return {
      ...common,
      source: {
        kind: 'computed',
        onLoad: definition.onLoad,
        ...(definition.onRun
          ? {
              onRun: definition.onRun as NonNullable<
                Extract<DatasetSource, { kind: 'computed' }>['onRun']
              >,
            }
          : {}),
      },
    };
  }
  if ((definition as { onRun?: unknown }).onRun !== undefined)
    throw new Error(`Dataset ${id} has onRun without onLoad`);
  if (definition.value !== undefined && definition.valueFile !== undefined)
    throw new Error(`Dataset ${id} has both value and valueFile; give one`);
  if (
    definition.files === undefined &&
    definition.value === undefined &&
    definition.valueFile === undefined
  )
    throw new Error(
      `Dataset ${id} is empty; give files, value, valueFile or onLoad`,
    );
  return {
    ...common,
    source: {
      kind: 'static',
      ...(definition.files !== undefined ? { files: definition.files } : {}),
      ...(definition.value !== undefined ? { value: definition.value } : {}),
      ...(definition.valueFile !== undefined
        ? { valueFile: definition.valueFile }
        : {}),
    },
  };
}

export function isDataset(value: unknown): value is Dataset {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'dataset' &&
    typeof (value as { source?: unknown }).source === 'object'
  );
}
