import type { CatalogEval } from '../api.js';

export function agentName(evaluation?: CatalogEval) {
  return evaluation?.agent.uri ?? evaluation?.agent.kind ?? 'adapter';
}
