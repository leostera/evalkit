import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  canonicalParameters,
  relativeDatasetPath,
  toJson,
  type Dataset,
  type DatasetContent,
  type DatasetFileSource,
  type DatasetTrialContext,
  type JsonValue,
  type TrialDataset,
} from '@evalkit/core';

/** A workspace file, by its path below the dataset's mount. */
export type PreparedFile =
  | { path: string; kind: 'bytes'; data: Uint8Array }
  | { path: string; kind: 'file'; source: string };

/** One trial's copy of a dataset, with relative paths resolved and its value converted to JSON. */
export type PreparedDataset = {
  dataset: Dataset;
  files:
    | { kind: 'none' }
    | { kind: 'directory'; source: string }
    | { kind: 'entries'; entries: PreparedFile[] };
  value?: JsonValue;
  digest: string;
};

// Keyed by the dataset value, so reloading the project (new modules) starts fresh.
const loads = new WeakMap<Dataset, Map<string, Promise<DatasetContent>>>();

/**
 * Loads a dataset at most once per process and project root. A failed load is
 * forgotten, so the next trial that needs the dataset tries again.
 */
export function loadDataset(
  dataset: Dataset,
  root: string,
  signal: AbortSignal,
): Promise<DatasetContent> {
  let byRoot = loads.get(dataset);
  if (!byRoot) loads.set(dataset, (byRoot = new Map()));
  const cached = byRoot.get(root);
  if (cached) return cached;
  const loading = loadUncached(dataset, root, signal);
  byRoot.set(root, loading);
  loading.catch(() => {
    if (byRoot.get(root) === loading) byRoot.delete(root);
  });
  return loading;
}

async function loadUncached(
  dataset: Dataset,
  root: string,
  signal: AbortSignal,
): Promise<DatasetContent> {
  const { source } = dataset;
  if (source.kind === 'computed') {
    const loaded = await source.onLoad({ root, signal });
    if (typeof loaded !== 'object' || loaded === null)
      throw new Error(
        `Dataset ${dataset.id} onLoad must return { files?, value? }`,
      );
    return loaded;
  }
  return {
    ...(source.files !== undefined ? { files: source.files } : {}),
    ...(source.valueFile !== undefined
      ? {
          value: await readValueFile(
            dataset.id,
            path.resolve(root, source.valueFile),
          ),
        }
      : source.value !== undefined
        ? { value: source.value }
        : {}),
  };
}

/** `.json` is one value; `.jsonl` is an array of one JSON object per non-blank line. */
async function readValueFile(id: string, file: string): Promise<unknown> {
  const text = await readFile(file, 'utf8').catch((cause: unknown) => {
    throw new Error(`Dataset ${id} cannot read ${file}: ${String(cause)}`);
  });
  if (file.endsWith('.jsonl')) {
    return text.split('\n').flatMap((line, index) => {
      if (!line.trim()) return [];
      try {
        const row = JSON.parse(line) as unknown;
        if (typeof row !== 'object' || row === null || Array.isArray(row))
          throw new Error('expected a JSON object');
        return [row];
      } catch (cause) {
        throw new Error(
          `Dataset ${id} ${file}:${index + 1}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    });
  }
  if (file.endsWith('.json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch (cause) {
      throw new Error(
        `Dataset ${id} ${file}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
  throw new Error(
    `Dataset ${id} valueFile must be a .json or .jsonl file: ${file}`,
  );
}

/** Loads (cached), derives this trial's content with `onRun`, and resolves it. */
export async function prepareDatasets(
  datasets: readonly Dataset[],
  root: string,
  trial: DatasetTrialContext,
): Promise<PreparedDataset[]> {
  const prepared: PreparedDataset[] = [];
  for (const dataset of datasets) {
    const loaded = await loadDataset(dataset, root, trial.signal);
    const content =
      dataset.source.kind === 'computed' && dataset.source.onRun
        ? await dataset.source.onRun(loaded, trial)
        : loaded;
    if (typeof content !== 'object' || content === null)
      throw new Error(
        `Dataset ${dataset.id} onRun must return { files?, value? }`,
      );
    prepared.push(await resolveContent(dataset, content, root));
  }
  return prepared;
}

async function resolveContent(
  dataset: Dataset,
  content: DatasetContent,
  root: string,
): Promise<PreparedDataset> {
  const label = `Dataset ${dataset.id}`;
  const value =
    content.value === undefined
      ? undefined
      : toJson(content.value, `datasets.${dataset.id}.value`);
  let files: PreparedDataset['files'] = { kind: 'none' };
  if (typeof content.files === 'string') {
    const source = path.resolve(root, content.files);
    const info = await stat(source).catch(() => undefined);
    if (!info?.isDirectory())
      throw new Error(
        `${label} files directory does not exist: ${content.files}`,
      );
    files = { kind: 'directory', source };
  } else if (content.files !== undefined) {
    files = {
      kind: 'entries',
      entries: Object.entries(content.files).map(([file, source]) =>
        preparedFile(
          relativeDatasetPath(file, `${label} file`),
          source,
          root,
          label,
        ),
      ),
    };
  }
  return {
    dataset,
    files,
    ...(value === undefined ? {} : { value }),
    digest: await digest(files, value),
  };
}

function preparedFile(
  file: string,
  source: DatasetFileSource,
  root: string,
  label: string,
): PreparedFile {
  if (typeof source === 'string')
    return {
      path: file,
      kind: 'bytes',
      data: new TextEncoder().encode(source),
    };
  if (source instanceof Uint8Array)
    return { path: file, kind: 'bytes', data: source };
  if (
    typeof source === 'object' &&
    source !== null &&
    typeof source.file === 'string'
  )
    return {
      path: file,
      kind: 'file',
      source: path.resolve(root, source.file),
    };
  throw new Error(
    `${label} file ${file} must be a string, bytes, or { file: 'path' }`,
  );
}

/** Lists a directory's files as sorted relative POSIX paths. */
export async function listFiles(
  directory: string,
  prefix = '',
): Promise<string[]> {
  const entries = await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(...(await listFiles(directory, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function digest(
  files: PreparedDataset['files'],
  value: JsonValue | undefined,
): Promise<string> {
  const hash = createHash('sha256');
  const addFile = (file: string, data: Uint8Array) => {
    hash.update(`file ${file} ${data.byteLength}\n`);
    hash.update(data);
  };
  if (files.kind === 'directory') {
    for (const file of await listFiles(files.source))
      addFile(file, await readFile(path.join(files.source, file)));
  } else if (files.kind === 'entries') {
    for (const entry of [...files.entries].sort((a, b) =>
      a.path.localeCompare(b.path),
    ))
      addFile(
        entry.path,
        entry.kind === 'bytes' ? entry.data : await readFile(entry.source),
      );
  }
  if (value !== undefined) hash.update(`value ${canonicalParameters(value)}\n`);
  return `sha256:${hash.digest('hex')}`;
}

export function trialDatasets(
  prepared: readonly PreparedDataset[],
): TrialDataset[] {
  return prepared.map(({ dataset, digest }) => ({
    id: dataset.id,
    visibility: dataset.visibility,
    source: dataset.source.kind,
    digest,
  }));
}
