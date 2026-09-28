import {
  canonicalParameters,
  type EvalMatrix,
  type EvalMatrixCell,
} from '@evalkit/core';

export type CellQuery = {
  evalIds: string[];
  query: string;
  offset: number;
  limit: number;
  sort: string;
  direction: 'asc' | 'desc';
};

const MAX_SCAN = 100_000;

function display(value: unknown): string {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value) ?? String(value));
}

/** Bounded report projection; both count and rows come from the core eligible-cell iterator. */
export function listMatrixCells(matrix: EvalMatrix, input: CellQuery) {
  if (
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0 ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100
  )
    throw new Error(
      'Matrix page requires offset >= 0 and limit between 1 and 100',
    );
  const dimensions = [
    ...Object.keys(matrix.cases?.[0] ?? {}),
    ...Object.keys(matrix.parameters),
  ];
  if (
    ![
      'eval',
      'agent',
      'trials',
      ...dimensions.map((key) => `axis:${key}`),
    ].includes(input.sort)
  )
    throw new Error(`Unknown matrix sort: ${input.sort}`);
  const selection = input.evalIds.length ? { evals: input.evalIds } : {};
  const planned = matrix.count(selection);
  if (planned > MAX_SCAN)
    throw new Error(
      `Matrix has ${planned} eligible cells; narrow the selection in the CLI (dashboard limit ${MAX_SCAN})`,
    );
  const terms = input.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const cells = [...matrix.cells(selection)].filter((cell) => {
    const fields = [
      cell.eval.id,
      cell.eval.name,
      cell.eval.agent?.identity?.name,
      cell.eval.agent?.identity?.kind,
      ...Object.entries(cell.parameters).flatMap(([key, value]) => [
        key,
        display(value),
      ]),
    ];
    const haystack = fields.map(display).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  function value(cell: EvalMatrixCell) {
    if (input.sort.startsWith('axis:')) {
      const parameter = cell.parameters[input.sort.slice(5)];
      return typeof parameter === 'number'
        ? parameter
        : canonicalParameters(parameter!);
    }
    if (input.sort === 'eval') return cell.eval.name ?? cell.eval.id;
    if (input.sort === 'agent')
      return (
        cell.eval.agent?.identity?.name ?? cell.eval.agent?.identity?.kind ?? ''
      );
    return cell.eval.policy?.trials ?? 1;
  }
  cells.sort((left, right) => {
    const a = value(left);
    const b = value(right);
    const comparison =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), undefined, {
            numeric: true,
            sensitivity: 'base',
          });
    return (
      (input.direction === 'asc' ? comparison : -comparison) ||
      left.key.localeCompare(right.key)
    );
  });
  return {
    total: cells.length,
    planned,
    cells: cells
      .slice(input.offset, input.offset + input.limit)
      .map((cell) => ({
        evalId: cell.eval.id,
        key: cell.key,
        parameters: cell.parameters,
      })),
  };
}
