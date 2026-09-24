import { Fragment, useState } from 'react';
import type { CatalogEval, DashboardApi, SuiteSummary } from '../api.js';
import { Empty } from './Empty.js';
import { EvalRow } from './EvalRow.js';
import { SuiteRow } from './SuiteRow.js';
export function SuiteTable({
  api,
  suites,
  catalog,
  selectedSuiteId,
  onOpenSuite,
  onOpenEval,
}: {
  api: DashboardApi;
  suites: SuiteSummary[];
  catalog: CatalogEval[];
  selectedSuiteId?: string;
  onOpenSuite(id: string): void;
  onOpenEval(entry: CatalogEval): void;
}) {
  const [expanded, setExpanded] = useState<string>();
  const expandedSuite = selectedSuiteId ?? expanded;
  if (!suites.length) return <Empty message="No suites are loaded." />;
  return (
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
                onRun={() => void api.runSuite(suite.id)}
              />
              {expandedSuite === suite.id ? (
                <tr key={`${suite.id}-evals`}>
                  <td colSpan={3}>
                    <table className="nested">
                      <thead>
                        <tr>
                          <th>Eval</th>
                          <th>Agent</th>
                          <th>Runtime</th>
                          <th>Trials</th>
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
                              onRun={
                                evaluation
                                  ? () => void api.runEval(evaluation.path)
                                  : undefined
                              }
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
  );
}
