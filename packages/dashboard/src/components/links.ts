/**
 * Dashboard URLs. Evals are results: the scoreboard, then runs and their
 * workspaces. The library is definitions: agents, judges, scenarios and
 * datasets, each with its own page.
 */
const segment = encodeURIComponent;

export const scoreboardHref = '/scoreboard';
export const runsListHref = '/runs';
export const workspacesHref = '/workspaces';
export const runHref = (runId: string) => `/runs/${segment(runId)}`;
/** The Runs list narrowed to the runs launched together with this one. */
export const batchHref = (batchId: string) =>
  `${runsListHref}?batch=${segment(batchId)}`;
export const workspaceHref = (runId: string) => `${runHref(runId)}/workspace`;
export const attachmentsHref = (runId: string, file?: string) =>
  `${runHref(runId)}/attachments${file ? `?file=${segment(file)}` : ''}`;

export type LibrarySection = 'agents' | 'judges' | 'scenarios' | 'datasets';
export const libraryHref = (section: LibrarySection, id?: string) =>
  `/library/${section}${id === undefined ? '' : `/${segment(id)}`}`;
export const agentHref = (key: string) => libraryHref('agents', key);
export const judgeHref = (key: string) => libraryHref('judges', key);
export const scenarioHref = (evalId: string) =>
  libraryHref('scenarios', evalId);
export const datasetHref = (id: string) => libraryHref('datasets', id);
