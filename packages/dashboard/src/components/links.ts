/**
 * Dashboard URLs follow the hierarchy: a scenario has runs, a run has trials,
 * and a trial has a trajectory (its page) and a candidate workspace.
 */
const segment = encodeURIComponent;

export const scenariosHref = '/scenarios';
export const scenarioHref = (evalId: string) => `/scenarios/${segment(evalId)}`;
export const runHref = (runId: string) => `/runs/${segment(runId)}`;
export const trialHref = (runId: string, trialId: string) =>
  `${runHref(runId)}/trials/${segment(trialId)}`;
export const workspaceHref = (runId: string, trialId: string) =>
  `${trialHref(runId, trialId)}/workspace`;
