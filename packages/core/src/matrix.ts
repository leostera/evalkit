import { parseResourceUri, type ResourceUri } from './identity.js';
import type { EvalDefinition, JsonObject, JsonValue } from './index.js';

/** Canonical JSON: keys sorted recursively, array order preserved. Rejects non-JSON inputs. */
export function canonicalParameters(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalParameters).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalParameters(value[key]!)}`).join(',')}}`;
  }
  throw new Error('Matrix parameters must be finite JSON values');
}

export type MatrixSelection = {
  /** Base eval URIs or slugs. Unknown values fail before any dispatch. */
  evals?: readonly string[];
  /** Select existing axis values, rather than overwriting every cell with the same value. */
  parameters?: Readonly<Record<string, readonly JsonValue[]>>;
  /** Overrides for non-axis execution settings (e.g. maxTokens). */
  overrides?: JsonObject;
};
export type EvalMatrixCell = {
  matrixUri: ResourceUri<'matrix'>;
  /** Stable canonical key including matrix, base eval and effective parameters. */
  key: string;
  eval: EvalDefinition;
  parameters: JsonObject;
};
export type EvalMatrixDefinition = {
  uri: ResourceUri<'matrix'>;
  slug?: string;
  name?: string;
  evals: readonly EvalDefinition[];
  parameters: Readonly<Record<string, readonly JsonValue[]>>;
  defaults?: JsonObject;
};
export type EvalMatrix = EvalMatrixDefinition & {
  kind: 'matrix';
  count(selection?: MatrixSelection): number;
  cells(selection?: MatrixSelection): IterableIterator<EvalMatrixCell>;
};

export function defineEvalMatrix<const T extends EvalMatrixDefinition>(definition: T): EvalMatrix & T {
  parseResourceUri(definition.uri, 'matrix');
  const identities = new Set<string>();
  for (const evaluation of definition.evals) {
    if (identities.has(evaluation.uri)) throw new Error(`Duplicate matrix eval: ${evaluation.uri}`);
    identities.add(evaluation.uri);
  }
  const axes = Object.entries(definition.parameters).sort(([a], [b]) => a.localeCompare(b));
  for (const [axis, choices] of axes) {
    if (!axis || !choices.length) throw new Error(`Matrix axis ${axis} must have at least one value`);
    const keys = choices.map(canonicalParameters);
    if (new Set(keys).size !== keys.length) throw new Error(`Duplicate values for matrix axis: ${axis}`);
  }
  canonicalParameters(definition.defaults ?? {});
  function select(selection: MatrixSelection = {}) {
    for (const key of Object.keys(selection.parameters ?? {})) {
      if (!(key in definition.parameters)) throw new Error(`Unknown matrix axis: ${key}`);
    }
    for (const key of Object.keys(selection.overrides ?? {})) {
      if (key in definition.parameters) throw new Error(`Select axis ${key}; do not override it`);
    }
    canonicalParameters(selection.overrides ?? {});
    for (const name of selection.evals ?? []) {
      if (!definition.evals.some(e => e.uri === name || e.slug === name)) throw new Error(`Unknown matrix eval: ${name}`);
    }
    const evals = definition.evals.filter(e => !selection.evals || selection.evals.includes(e.uri) || (e.slug && selection.evals.includes(e.slug)));
    const selectedAxes = axes.map(([axis, choices]) => {
      const selected = selection.parameters?.[axis];
      if (!selected) return [axis, choices] as const;
      const keys = new Set(selected.map(canonicalParameters));
      for (const key of keys) if (!choices.some(v => canonicalParameters(v) === key)) throw new Error(`Unknown ${axis} value: ${key}`);
      return [axis, choices.filter(v => keys.has(canonicalParameters(v)))] as const;
    });
    return { evals, axes: selectedAxes, defaults: { ...definition.defaults, ...selection.overrides } };
  }
  return {
    ...definition,
    kind: 'matrix',
    count(selection) {
      const selected = select(selection);
      const count = selected.axes.reduce((n, [, choices]) => n * choices.length, selected.evals.length);
      if (!Number.isSafeInteger(count)) throw new Error('Matrix exceeds safe cell count');
      return count;
    },
    *cells(selection) {
      const selected = select(selection);
      function* expand(index: number, values: JsonObject): Generator<JsonObject> {
        if (index === selected.axes.length) { yield values; return; }
        const [axis, choices] = selected.axes[index]!;
        for (const choice of choices) yield* expand(index + 1, { ...values, [axis]: choice });
      }
      for (const evaluation of selected.evals) {
        for (const parameters of expand(0, selected.defaults)) {
          yield { matrixUri: definition.uri, eval: evaluation, parameters,
            key: canonicalParameters({ matrix: definition.uri, eval: evaluation.uri, parameters }) };
        }
      }
    },
  };
}
