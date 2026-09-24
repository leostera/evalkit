import type { CatalogEval } from '../api.js';

export function agentName(evaluation?: CatalogEval) {
  return evaluation?.agent.name ?? evaluation?.agent.id ?? evaluation?.agent.kind ?? 'adapter';
}
