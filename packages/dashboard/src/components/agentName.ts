import type { CatalogEval } from '../api.js';

/** Groups catalog entries on the Agents page and selects one via `?agent=`. */
export function agentKey(evaluation: CatalogEval) {
  return evaluation.agent.id ?? agentName(evaluation);
}

export function agentName(evaluation?: CatalogEval) {
  return (
    evaluation?.agent.name ??
    evaluation?.agent.id ??
    evaluation?.agent.kind ??
    'adapter'
  );
}
