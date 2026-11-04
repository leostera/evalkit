import type { CatalogEval } from '../api.js';

/**
 * The sandbox a scenario's runs use, as the runner picks it: a matrix
 * cell's `sandbox` parameter, then the scenario's own; `default` when
 * neither names one, so the project's or the host is used.
 */
export function sandboxName(
  evaluation: CatalogEval | undefined,
  cellParameters?: Readonly<Record<string, unknown>>,
): string {
  const fromCell = cellParameters?.sandbox;
  if (typeof fromCell === 'string') return fromCell;
  return evaluation?.sandbox ?? 'default';
}
