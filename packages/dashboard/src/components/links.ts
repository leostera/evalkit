/**
 * Dashboard URLs. Evals are results: the scoreboard, then runs, trials and
 * workspaces. The library is definitions: agents, judges, scenarios and
 * datasets, each with its own page.
 */
const segment = encodeURIComponent;

export const scoreboardHref = '/scoreboard';
export const runsListHref = '/runs';
export const trialsHref = '/trials';
export const workspacesHref = '/workspaces';
export const runHref = (runId: string) => `/runs/${segment(runId)}`;
export const trialHref = (runId: string, trialId: string) =>
  `${runHref(runId)}/trials/${segment(trialId)}`;
export const workspaceHref = (runId: string, trialId: string) =>
  `${trialHref(runId, trialId)}/workspace`;

export type LibrarySection = 'agents' | 'judges' | 'scenarios' | 'datasets';
export const libraryHref = (section: LibrarySection, id?: string) =>
  `/library/${section}${id === undefined ? '' : `/${segment(id)}`}`;
export const agentHref = (key: string) => libraryHref('agents', key);
export const judgeHref = (key: string) => libraryHref('judges', key);
export const scenarioHref = (evalId: string) =>
  libraryHref('scenarios', evalId);
export const datasetHref = (id: string) => libraryHref('datasets', id);
