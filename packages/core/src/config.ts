import type { EvalDefinition, EvalRegistry } from './index.js';
import type { EvalMatrixDefinition } from './matrix.js';

export type EvalkitConfig = {
  /** Where scenarios are discovered. Default `scenarios`. Paths are relative to evalkit.config.js/ts. */
  testDir?: string;
  include?: readonly string[];
  exclude?: readonly string[];
  discovery?: {
    /** Each directory directly below `testDir` is a suite. Default true. */
    suites?: boolean;
  };
  /** Explicit definitions are an alternative to discovery (e.g. hosted registries). */
  evals?: readonly EvalDefinition[];
  registry?: EvalRegistry;
  /** Applied to every discovered eval. Values are forwarded, never provider-interpreted. */
  matrix?: Omit<EvalMatrixDefinition, 'evals' | 'id'> & { id?: string };
  execution?: { concurrency?: number; trials?: number; maxCells?: number };
  reportDir?: string;
  /** The candidate files saved with each trial's results. */
  artifacts?: {
    /**
     * Paths to leave out, as globs relative to the candidate workspace; a
     * pattern without `/` matches that name at any depth. Replaces the default,
     * `DEFAULT_ARTIFACT_EXCLUDE` (dependencies, build output, VCS metadata).
     * A scenario's `workspace.ignore` patterns come after these.
     */
    exclude?: readonly string[];
    /** Limits for files adapters `attach()`. */
    attachments?: AttachmentLimits;
  };
  /** Where each trial's real workspace lives during a run. Default `_evalkit-sandbox`. */
  sandboxDir?: string;
  /** Which trial workspaces to keep in `sandboxDir` afterwards. Default `'failed'`: only trials that did not pass. */
  keepSandboxes?: KeepSandboxes;
  share?: ShareConfig;
};

export type KeepSandboxes = 'failed' | 'all' | 'none';

export type AttachmentLimits = {
  /** A larger attachment keeps its last this-many bytes. Default 5 MB. */
  maxFileBytes?: number;
  /** All of one trial's attachments; past it, `attach()` rejects. Default 20 MB. */
  maxTrialBytes?: number;
};

export const DEFAULT_ATTACHMENT_LIMITS: Required<AttachmentLimits> = {
  maxFileBytes: 5_000_000,
  maxTrialBytes: 20_000_000,
};

/** Left out of candidate snapshots unless `artifacts.exclude` says otherwise. */
export const DEFAULT_ARTIFACT_EXCLUDE: readonly string[] = [
  '.git',
  'node_modules',
  '.venv',
  '__pycache__',
  '_build',
  '_opam',
  'target',
];

/** HTTP header names and values. */
export type ShareHeaders = Record<string, string>;

export type ShareConfig = {
  /** Where `evalkit share` uploads results. `--server <url>` overrides it. */
  url: string;
  /**
   * Extra headers for every request to the share server, e.g. credentials for
   * an auth proxy in front of it. A function is called once per `evalkit share`
   * (it may run a command to fetch a token). Values are never printed.
   */
  headers?: ShareHeaders | (() => ShareHeaders | Promise<ShareHeaders>);
};

/** Pure, typed project configuration. Loading/discovery belongs to the CLI. */
export function defineConfig<const T extends EvalkitConfig>(
  configuration: T,
): T {
  return configuration;
}
