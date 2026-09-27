import { Fragment, useState } from 'react';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { Empty } from './Empty.js';
import { MatrixEvalTable } from './MatrixEvalTable.js';
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
  const [runError, setRunError] = useState<string>();
  const runEval = (path: string, parameters?: Record<string, unknown>) => {
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
        <p>
          Each row is one configured matrix cell. Run one row at a time; use the
          CLI dry-run for larger selections.
        </p>
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
                        <MatrixEvalTable
                          evalIds={suite.evalIds}
                          catalog={catalog}
                          matrix={matrix}
                          runs={runs}
                          nested
                          onRun={runEval}
                          onOpenEval={onOpenEval}
                        />
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
            <MatrixEvalTable
              evalIds={standalone.map((evaluation) => evaluation.id)}
              catalog={catalog}
              matrix={matrix}
              runs={runs}
              onRun={runEval}
              onOpenEval={onOpenEval}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
