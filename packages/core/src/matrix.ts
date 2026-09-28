import {
  authoringId,
  type EvalDefinition,
  type JsonObject,
  type JsonValue,
} from './index.js';

/** Canonical JSON: keys sorted recursively, array order preserved. Rejects non-JSON inputs. */
export function canonicalParameters(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalParameters).join(',')}]`;
  if (
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalParameters(value[key]!)}`,
      )
      .join(',')}}`;
  }
  throw new Error('Matrix parameters must be finite JSON values');
}

export type MatrixSelection = {
  /** Base eval IDs. Unknown values fail before dispatch. */
  evals?: readonly string[];
  /** Select existing dimension values, rather than overwriting every cell with the same value. */
  parameters?: Readonly<Record<string, readonly JsonValue[]>>;
  /** Overrides for non-dimension execution settings (e.g. maxTokens). */
  overrides?: JsonObject;
};
export type EvalMatrixCell = {
  matrixId: string;
  /** Stable canonical key including matrix, base eval and effective parameters. */
  key: string;
  eval: EvalDefinition;
  parameters: JsonObject;
};
export type EvalMatrixDefinition = {
  id: string;
  name?: string;
  evals: readonly EvalDefinition[];
  parameters: Readonly<Record<string, readonly JsonValue[]>>;
  defaults?: JsonObject;
  /** Complete correlated assignments, crossed with independent parameters. */
  cases?: readonly JsonObject[];
  /** Partial patterns over declared dimensions; matching cells are never run. */
  exclude?: readonly JsonObject[];
};
export type EvalMatrix = EvalMatrixDefinition & {
  kind: 'matrix';
  count(selection?: MatrixSelection): number;
  cells(selection?: MatrixSelection): IterableIterator<EvalMatrixCell>;
};

const COUNT_BUDGET = 100_000;
const equal = (a: JsonValue, b: JsonValue) =>
  canonicalParameters(a) === canonicalParameters(b);
const matches = (pattern: JsonObject, values: JsonObject) =>
  Object.entries(pattern).every(
    ([key, value]) => Object.hasOwn(values, key) && equal(values[key]!, value),
  );

export function defineEvalMatrix<const T extends EvalMatrixDefinition>(
  definition: T,
): EvalMatrix & T {
  authoringId(definition);
  const identities = new Set<string>();
  for (const evaluation of definition.evals) {
    const id = authoringId(evaluation);
    if (identities.has(id)) throw new Error(`Duplicate matrix eval: ${id}`);
    identities.add(id);
  }
  const axes = Object.entries(definition.parameters).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [axis, choices] of axes) {
    if (!axis || !choices.length)
      throw new Error(`Matrix axis ${axis} must have at least one value`);
    const keys = choices.map(canonicalParameters);
    if (new Set(keys).size !== keys.length)
      throw new Error(`Duplicate values for matrix axis: ${axis}`);
  }
  canonicalParameters(definition.defaults ?? {});
  if (definition.cases && !definition.cases.length)
    throw new Error('Matrix cases must have at least one assignment');
  const cases = definition.cases ?? [{}];
  const caseKeys = Object.keys(cases[0]!).sort();
  const caseSignatures = new Set<string>();
  for (const assignment of cases) {
    canonicalParameters(assignment);
    if (Object.keys(assignment).sort().join('\0') !== caseKeys.join('\0'))
      throw new Error('Matrix cases must have the same dimensions');
    for (const key of caseKeys) {
      if (
        Object.hasOwn(definition.parameters, key) ||
        Object.hasOwn(definition.defaults ?? {}, key)
      )
        throw new Error(
          `Matrix case dimension conflicts with axis or default: ${key}`,
        );
    }
    const signature = canonicalParameters(assignment);
    if (caseSignatures.has(signature)) throw new Error('Duplicate matrix case');
    caseSignatures.add(signature);
  }
  const declared = new Set([...caseKeys, ...axes.map(([key]) => key)]);
  const exclusions = definition.exclude ?? [];
  for (const [index, pattern] of exclusions.entries()) {
    canonicalParameters(pattern);
    if (!Object.keys(pattern).length)
      throw new Error(`Matrix exclude[${index}] must specify a dimension`);
    for (const key of Object.keys(pattern))
      if (!declared.has(key))
        throw new Error(`Unknown matrix exclude dimension: ${key}`);
    if (
      !cases.some((assignment) =>
        Object.entries(pattern).every(
          ([key, value]) =>
            !Object.hasOwn(assignment, key) || equal(assignment[key]!, value),
        ),
      ) ||
      !axes.every(
        ([key, choices]) =>
          !Object.hasOwn(pattern, key) ||
          choices.some((choice) => equal(choice, pattern[key]!)),
      )
    )
      throw new Error(`Matrix exclude[${index}] matches no declared cell`);
  }
  const caseChoices = new Map(
    caseKeys.map((key) => [key, cases.map((assignment) => assignment[key]!)]),
  );

  function select(selection: MatrixSelection = {}) {
    for (const key of Object.keys(selection.parameters ?? {})) {
      if (!declared.has(key)) throw new Error(`Unknown matrix axis: ${key}`);
    }
    for (const key of Object.keys(selection.overrides ?? {})) {
      if (declared.has(key))
        throw new Error(`Select axis ${key}; do not override it`);
    }
    canonicalParameters(selection.overrides ?? {});
    for (const name of selection.evals ?? []) {
      if (!definition.evals.some((e) => e.id === name))
        throw new Error(`Unknown matrix eval: ${name}`);
    }
    const evals = definition.evals.filter(
      (e) => !selection.evals || selection.evals.includes(e.id),
    );
    const selected = new Map<string, Set<string>>();
    for (const [key, values] of Object.entries(selection.parameters ?? {})) {
      const available = definition.parameters[key] ?? caseChoices.get(key)!;
      const keys = new Set(values.map(canonicalParameters));
      for (const value of keys)
        if (!available.some((choice) => canonicalParameters(choice) === value))
          throw new Error(`Unknown ${key} value: ${value}`);
      selected.set(key, keys);
    }
    const filteredCases = cases.filter((assignment) =>
      caseKeys.every(
        (key) =>
          !selected.has(key) ||
          selected.get(key)!.has(canonicalParameters(assignment[key]!)),
      ),
    );
    const selectedAxes = axes.map(
      ([axis, choices]) =>
        [
          axis,
          choices.filter(
            (choice) =>
              !selected.has(axis) ||
              selected.get(axis)!.has(canonicalParameters(choice)),
          ),
        ] as const,
    );
    return {
      evals,
      cases: filteredCases,
      axes: selectedAxes,
      defaults: { ...definition.defaults, ...selection.overrides },
    };
  }

  /** Inclusion/exclusion counts sparse forbidden patterns without expanding the product. */
  function countCase(
    assignment: JsonObject,
    selectedAxes: readonly (readonly [string, readonly JsonValue[]])[],
    budget: { remaining: number },
  ): number {
    const patterns = exclusions
      .filter((pattern) =>
        Object.entries(pattern).every(
          ([key, value]) =>
            !Object.hasOwn(assignment, key) || equal(assignment[key]!, value),
        ),
      )
      .map(
        (pattern) =>
          Object.fromEntries(
            Object.entries(pattern).filter(
              ([key]) => !Object.hasOwn(assignment, key),
            ),
          ) as JsonObject,
      );
    const product = selectedAxes.reduce(
      (count, [, values]) => count * values.length,
      1,
    );
    if (!patterns.length) return product;
    if (patterns.some((pattern) => !Object.keys(pattern).length)) return 0;
    function intersection(pattern: JsonObject): number {
      return selectedAxes.reduce(
        (count, [axis, choices]) =>
          count *
          (Object.hasOwn(pattern, axis)
            ? Number(choices.some((choice) => equal(choice, pattern[axis]!)))
            : choices.length),
        1,
      );
    }
    let eligible = product;
    function visit(start: number, combined: JsonObject, sign: number): void {
      for (let index = start; index < patterns.length; index++) {
        if (--budget.remaining < 0)
          throw new Error(
            'Exact matrix count exceeds planning budget; narrow the selection or exclusions',
          );
        const pattern = patterns[index]!;
        if (
          Object.entries(pattern).some(
            ([key, value]) =>
              Object.hasOwn(combined, key) && !equal(combined[key]!, value),
          )
        )
          continue;
        const merged = { ...combined, ...pattern };
        const matches = intersection(merged);
        if (!matches) continue;
        eligible += sign * matches;
        visit(index + 1, merged, -sign);
      }
    }
    visit(0, {}, -1);
    return eligible;
  }

  return {
    ...definition,
    kind: 'matrix',
    count(selection) {
      const selected = select(selection);
      const budget = { remaining: COUNT_BUDGET };
      const perEval = selected.cases.reduce(
        (count, assignment) =>
          count + countCase(assignment, selected.axes, budget),
        0,
      );
      const count = perEval * selected.evals.length;
      if (!Number.isSafeInteger(count))
        throw new Error('Matrix exceeds safe cell count');
      return count;
    },
    *cells(selection) {
      const selected = select(selection);
      function* expand(
        index: number,
        values: JsonObject,
      ): Generator<JsonObject> {
        if (index === selected.axes.length) {
          yield values;
          return;
        }
        const [axis, choices] = selected.axes[index]!;
        for (const choice of choices)
          yield* expand(index + 1, { ...values, [axis]: choice });
      }
      for (const evaluation of selected.evals) {
        for (const assignment of selected.cases) {
          for (const dimensions of expand(0, assignment)) {
            if (exclusions.some((pattern) => matches(pattern, dimensions)))
              continue;
            const parameters = { ...selected.defaults, ...dimensions };
            yield {
              matrixId: definition.id,
              eval: evaluation,
              parameters,
              key: canonicalParameters({
                matrix: authoringId(definition),
                eval: authoringId(evaluation),
                parameters,
              }),
            };
          }
        }
      }
    },
  };
}
