import type { AutAdapter, EvalDefinition, EvalRegistry } from './index.js';
import type { Fixture, Sandbox } from './sandbox.js';
import type { LimitsInput } from './limits.js';
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
  execution?: { concurrency?: number; repeat?: number; maxCells?: number };
  /**
   * What each run may use before EvalKit stops it: `{ steps: 40, tokens:
   * 2_000_000, time: '20m' }`. A scenario's `limits`, a matrix cell's and
   * `--limit` override these, kind by kind.
   */
  limits?: LimitsInput;
  /**
   * The project's sandboxes by id, so scenarios, the `sandbox` default and a
   * matrix axis named `sandbox` can name them. Each key is its sandbox's id.
   */
  sandboxes?: Readonly<Record<string, Sandbox>>;
  /**
   * Where runs happen unless their scenario or matrix cell says otherwise:
   * a `defineSandbox(...)` or a name in `sandboxes`. Default: this machine.
   */
  sandbox?: Sandbox | string;
  /**
   * Services runs reach, by name: started on the host before the first run
   * that needs them and stopped after the invocation's last. Each run finds
   * them in `context.fixtures`.
   */
  fixtures?: Readonly<Record<string, Fixture>>;
  reportDir?: string;
  /** The candidate files saved with each run's results. */
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
  /**
   * Where each run's real workspace lives. Default: outside the project, in
   * `<tmp>/evalkit/<project>-<hash>`, so agents cannot read the project or
   * other runs by looking around. Inside the project, `run` warns.
   */
  sandboxDir?: string;
  /** Which run workspaces to keep in `sandboxDir` afterwards. Default `'failed'`: only runs that did not pass. */
  keepSandboxes?: KeepSandboxes;
  share?: ShareConfig;
  /**
   * The agent for every judge that names none: `judge(name, { rubric })`.
   * Made with `defineAgent()`; it gets each run's parameters, so a matrix
   * axis can choose its model.
   */
  judge?: AutAdapter;
};

export type KeepSandboxes = 'failed' | 'all' | 'none';

export type AttachmentLimits = {
  /** A larger attachment keeps its last this-many bytes. Default 5 MB. */
  maxFileBytes?: number;
  /** All of one run's attachments; past it, `attach()` rejects. Default 20 MB. */
  maxRunBytes?: number;
};

export const DEFAULT_ATTACHMENT_LIMITS: Required<AttachmentLimits> = {
  maxFileBytes: 5_000_000,
  maxRunBytes: 20_000_000,
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
  const sandboxes = configuration.sandboxes ?? {};
  for (const [name, sandbox] of Object.entries(sandboxes))
    if (sandbox.id !== name)
      throw new Error(
        `sandboxes.${name} is the sandbox ${JSON.stringify(sandbox.id)}: name it by its id`,
      );
  if (
    typeof configuration.sandbox === 'string' &&
    !sandboxes[configuration.sandbox]
  )
    throw new Error(
      `sandbox ${JSON.stringify(configuration.sandbox)} is not in sandboxes (${Object.keys(sandboxes).join(', ') || 'none'})`,
    );
  return configuration;
}
