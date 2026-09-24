import type { EvalDefinition, EvalRegistry } from './index.js';
import type { EvalMatrixDefinition } from './matrix.js';

export type EvalkitConfig = {
  /** Paths are relative to evalkit.config.js/ts, not the invoking shell directory. */
  testDir?: string;
  include?: readonly string[];
  exclude?: readonly string[];
  /** Explicit definitions are an alternative to discovery (e.g. hosted registries). */
  evals?: readonly EvalDefinition[];
  registry?: EvalRegistry;
  /** Applied to every discovered eval. Values are forwarded, never provider-interpreted. */
  matrix?: Omit<EvalMatrixDefinition, 'evals' | 'id'> & { id?: string };
  execution?: { concurrency?: number; trials?: number; maxCells?: number };
  reportDir?: string;
  sandboxDir?: string;
};

/** Pure, typed project configuration. Loading/discovery belongs to the CLI. */
export function defineConfig<const T extends EvalkitConfig>(configuration: T): T {
  return configuration;
}
