import type { BundleFile } from './bundle.js';
import {
  allowedRunPath,
  isSha,
  isUuid,
  repoKey,
  validRepoKey,
} from './paths.js';

/** Rejected input: the client sent something the server will not store. */
export class Rejected extends Error {}

/** Finished runs only: a shared run's files are immutable once stored. */
export type SharedRunStatus = 'passed' | 'failed' | 'errored';

export type SharedSource = {
  repo: string;
  project: string;
  commit: string;
  ref?: string;
  committedAt?: string;
  dirty: boolean;
};

/** The fields of an uploaded run.json the server relies on. */
export type SharedRun = {
  id: string;
  evalId: string;
  suiteId?: string;
  status: SharedRunStatus;
  score?: number;
  startedAt: string;
  source: SharedSource;
  /** Repository key (`repo` plus `/~project`), checked to be URL- and path-safe. */
  repoKey: string;
  /** The whole run.json object, served as-is in runs.json. */
  summary: unknown;
};

export type RunCatalog = {
  catalog: unknown[];
  evals: unknown[];
  suites: unknown[];
};

/** A run bundle that passed every check; storing it cannot fail on its contents. */
export type RunUpload = {
  run: SharedRun;
  runJson: Uint8Array;
  catalog?: Uint8Array;
  /** trials.json and trials/** files. */
  files: BundleFile[];
};

export function parseUpload(bundle: readonly BundleFile[]): RunUpload {
  const byPath = new Map<string, Uint8Array>();
  for (const file of bundle) {
    if (!allowedRunPath(file.path))
      throw new Rejected(`File not allowed in a run bundle: ${file.path}`);
    if (byPath.has(file.path))
      throw new Rejected(`Duplicate file in bundle: ${file.path}`);
    byPath.set(file.path, file.data);
  }
  const runJson = byPath.get('run.json');
  if (!runJson) throw new Rejected('Bundle has no run.json');
  const catalog = byPath.get('catalog.json');
  if (catalog) parseCatalog(catalog);
  return {
    run: parseRun(runJson),
    runJson,
    ...(catalog ? { catalog } : {}),
    files: bundle.filter(
      (file) => file.path !== 'run.json' && file.path !== 'catalog.json',
    ),
  };
}

export function parseRun(data: Uint8Array): SharedRun {
  const value = record(parseJson(data, 'run.json'), 'run.json');
  const source = record(value.source, 'run.json source');
  const id = text(value.id, 'id');
  if (!isUuid(id)) throw new Rejected('run.json id must be a UUID');
  const commit = text(source.commit, 'source.commit');
  if (!isSha(commit))
    throw new Rejected('source.commit must be a full 40-character SHA');
  if (typeof source.dirty !== 'boolean')
    throw new Rejected('source.dirty must be a boolean');
  const status = value.status;
  if (status !== 'passed' && status !== 'failed' && status !== 'errored')
    throw new Rejected(
      `Only finished runs can be shared (status ${JSON.stringify(status)})`,
    );
  if (value.score !== undefined && typeof value.score !== 'number')
    throw new Rejected('score must be a number');
  const shared: SharedSource = {
    repo: text(source.repo, 'source.repo'),
    project: projectPath(source.project),
    commit,
    dirty: source.dirty,
    ...optionalText(source.ref, 'ref', 'source.ref'),
    ...optionalText(source.committedAt, 'committedAt', 'source.committedAt'),
  };
  const key = repoKey(shared);
  if (!validRepoKey(key)) throw new Rejected(`Invalid repository: ${key}`);
  return {
    id,
    evalId: text(value.evalId, 'evalId'),
    status,
    startedAt: text(value.startedAt, 'startedAt'),
    source: shared,
    repoKey: key,
    summary: value,
    ...optionalText(value.suiteId, 'suiteId', 'suiteId'),
    ...(typeof value.score === 'number' ? { score: value.score } : {}),
  };
}

export function parseCatalog(data: Uint8Array): RunCatalog {
  const value = record(parseJson(data, 'catalog.json'), 'catalog.json');
  const list = (field: keyof RunCatalog) => {
    const items = value[field];
    if (!Array.isArray(items))
      throw new Rejected(`catalog.json ${field} must be a list`);
    return items as unknown[];
  };
  return {
    catalog: list('catalog'),
    evals: list('evals'),
    suites: list('suites'),
  };
}

/** The eval project's path in the repository; `''` at the root. */
function projectPath(value: unknown): string {
  if (typeof value !== 'string')
    throw new Rejected('source.project must be a string');
  return value;
}

function parseJson(data: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Rejected(`${name} is not valid JSON`);
  }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Rejected(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value)
    throw new Rejected(`${name} must be a non-empty string`);
  return value;
}

function optionalText<K extends string>(
  value: unknown,
  key: K,
  name: string,
): Partial<Record<K, string>> {
  if (value === undefined || value === null || value === '') return {};
  return { [key]: text(value, name) } as Record<K, string>;
}
