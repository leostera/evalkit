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
/**
 * A run's sections: its trajectory beside its verdicts (the run's own URL),
 * then what judging cost, its metrics, the files its agent left (workspace),
 * the files saved on purpose with `attach()` (logs), its datasets, and the
 * raw report.
 */
export type RunSection =
  'run' | 'judging' | 'metrics' | 'workspace' | 'logs' | 'datasets' | 'raw';
export const runSectionHref = (runId: string, section: RunSection) =>
  section === 'run' ? runHref(runId) : `${runHref(runId)}/${section}`;
export const workspaceHref = (runId: string) =>
  runSectionHref(runId, 'workspace');
export const logsHref = (runId: string, file?: string) =>
  `${runSectionHref(runId, 'logs')}${file ? `?file=${segment(file)}` : ''}`;

export type LibrarySection = 'agents' | 'judges' | 'scenarios' | 'datasets';
export const libraryHref = (section: LibrarySection, id?: string) =>
  `/library/${section}${id === undefined ? '' : `/${segment(id)}`}`;
export const agentHref = (key: string) => libraryHref('agents', key);
export const judgeHref = (key: string) => libraryHref('judges', key);
export const scenarioHref = (evalId: string) =>
  libraryHref('scenarios', evalId);
export const datasetHref = (id: string) => libraryHref('datasets', id);
