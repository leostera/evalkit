import {
  canonicalParameters,
  type EvalMatrix,
  type MatrixSelection,
} from '@evalkit/core';

/** Dashboard submissions are intentionally one explicit, configured cell at a time. */
export function selectDashboardCell(
  matrix: EvalMatrix,
  evalId: string,
  parameters: unknown,
): MatrixSelection {
  if (
    !parameters ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters)
  )
    throw new Error('Select one value for every matrix axis');
  const provided = parameters as Record<string, unknown>;
  const axes = Object.keys(matrix.parameters);
  if (
    Object.keys(provided).length !== axes.length ||
    axes.some((axis) => !Object.hasOwn(provided, axis))
  )
    throw new Error('Select one value for every matrix axis');
  const selected: Record<string, unknown[]> = {};
  for (const axis of axes) {
    const value = provided[axis];
    // JSON from the request must match a configured choice; arrays are valid values, not selections.
    if (
      !matrix.parameters[axis]!.some(
        (choice) =>
          canonicalParameters(choice) === canonicalParameters(value as never),
      )
    )
      throw new Error(`Unknown ${axis} value`);
    selected[axis] = [value];
  }
  const selection = {
    evals: [evalId],
    parameters: selected,
  } as MatrixSelection;
  if (matrix.count(selection) !== 1)
    throw new Error('Selection must contain exactly one cell');
  return selection;
}
