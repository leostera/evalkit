import { Fragment, useState } from 'react';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { Empty } from './Empty.js';
import { EvalRow } from './EvalRow.js';
import { SuiteRow } from './SuiteRow.js';
export function SuiteTable({
  api,
  suites,
  catalog,
  matrix,
  runs = [],
  selectedSuiteId,
  onOpenSuite,
  onOpenEval,
}: {
  api: DashboardApi;
  suites: SuiteSummary[];
  catalog: CatalogEval[];
  matrix?: MatrixSummary | null;
  runs?: RunSummary[];
  selectedSuiteId?: string;
  onOpenSuite(id: string): void;
  onOpenEval(entry: CatalogEval): void;
}) {
  const [expanded, setExpanded] = useState<string>();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [runError, setRunError] = useState<string>();
  const parameters =
    matrix &&
    Object.entries(matrix.parameters).every(
      ([axis, values]) =>
        choices[axis] !== undefined &&
        values[Number(choices[axis])] !== undefined,
    )
      ? Object.fromEntries(
          Object.entries(matrix.parameters).map(([axis, values]) => [
            axis,
            values[Number(choices[axis])],
          ]),
        )
      : undefined;
  const canRun =
    matrix === null || (matrix !== undefined && parameters !== undefined);
  const runEval = (path: string) => {
    if (!canRun) return;
    setRunError(undefined);
    void api
      .runEval(path, parameters)
      .catch((error: unknown) =>
        setRunError(
          error instanceof Error ? error.message : 'Unable to start eval',
        ),
      );
  };
  const expandedSuite = selectedSuiteId ?? expanded;
  const latestRunByEval = new Map<string, RunSummary>();
  for (const run of runs) {
    const previous = latestRunByEval.get(run.evalId);
    if (!previous || previous.startedAt <= run.startedAt)
      latestRunByEval.set(run.evalId, run);
  }
  const standalone = catalog.filter(
    (entry) =>
      !entry.suiteId &&
      !suites.some((suite) => suite.evalIds.includes(entry.id)),
  );
  if (!suites.length && !standalone.length)
    return <Empty message="No evals or suites are loaded." />;
  return (
    <>
      {matrix ? (
        <section aria-label="Matrix cell selection">
          <p>
            Choose one configured cell before running an eval. Suite-wide matrix
            runs require the CLI dry-run.
          </p>
          {Object.entries(matrix.parameters).map(([axis, values]) => (
            <label key={axis}>
              {axis}{' '}
              <select
                aria-label={axis}
                value={choices[axis] ?? ''}
                onChange={(event) =>
                  setChoices({ ...choices, [axis]: event.target.value })
                }
              >
                <option value="">Select {axis}</option>
                {values.map((value, index) => (
                  <option key={index} value={index}>
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      ) : null}
      {runError ? (
        <p className="error" role="alert">
          {runError}
        </p>
      ) : null}
      {suites.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Suite</th>
                <th>Evals</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {suites.map((suite) => (
                <Fragment key={suite.id}>
                  <SuiteRow
                    suite={suite}
                    expanded={expandedSuite === suite.id}
                    onToggle={() => {
                      setExpanded(
                        expandedSuite === suite.id ? undefined : suite.id,
                      );
                      onOpenSuite(suite.id);
                    }}
                    onRun={
                      matrix === null
                        ? () =>
                            void api
                              .runSuite(suite.id)
                              .catch((error: unknown) =>
                                setRunError(
                                  error instanceof Error
                                    ? error.message
                                    : 'Unable to start suite',
                                ),
                              )
                        : undefined
                    }
                  />
                  {expandedSuite === suite.id ? (
                    <tr key={`${suite.id}-evals`}>
                      <td colSpan={4}>
                        <table className="nested">
                          <thead>
                            <tr>
                              <th>Eval</th>
                              <th>Agent</th>
                              <th>Runtime</th>
                              <th>Trials</th>
                              <th>Latest run</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {suite.evalIds.map((id) => {
                              const evaluation = catalog.find(
                                (entry) => entry.id === id,
                              );
                              return (
                                <EvalRow
                                  key={id}
                                  id={id}
                                  evaluation={evaluation}
                                  status={latestRunByEval.get(id)?.status}
                                  onRun={
                                    evaluation && canRun
                                      ? () => runEval(evaluation.path)
                                      : undefined
                                  }
                                  runDisabled={!!evaluation && !canRun}
                                  onOpen={
                                    evaluation
                                      ? () => onOpenEval(evaluation)
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {standalone.length > 0 ? (
        <section aria-label="Standalone evals">
          <h2>Standalone evals</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Eval</th>
                  <th>Agent</th>
                  <th>Runtime</th>
                  <th>Trials</th>
                  <th>Latest run</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {standalone.map((evaluation) => (
                  <EvalRow
                    key={evaluation.id}
                    id={evaluation.id}
                    evaluation={evaluation}
                    status={latestRunByEval.get(evaluation.id)?.status}
                    onRun={canRun ? () => runEval(evaluation.path) : undefined}
                    runDisabled={!canRun}
                    onOpen={() => onOpenEval(evaluation)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
