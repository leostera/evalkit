import { Table } from '@cloudflare/kumo';
import { Fragment, useState } from 'react';
import type {
  CatalogEval,
  DashboardApi,
  MatrixSummary,
  RunSummary,
  SuiteSummary,
} from '../api.js';
import { DataTable } from './DataTable.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';
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
  const reportStartFailure = (fallback: string) => (error: unknown) =>
    setRunError(error instanceof Error ? error.message : fallback);
  const runEval = (path: string, parameters?: Record<string, unknown>) => {
    setRunError(undefined);
    void api
      .runEval(path, parameters)
      .catch(reportStartFailure('Unable to start eval'));
  };
  const runSuite = (id: string) => {
    setRunError(undefined);
    void api.runSuite(id).catch(reportStartFailure('Unable to start suite'));
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
        <p className="text-[13px] text-kumo-subtle">
          Each row is one configured matrix cell. Run one row at a time; use the
          CLI dry-run for larger selections.
        </p>
      ) : null}
      {runError ? <ErrorBanner message={runError} /> : null}
      {suites.length > 0 ? (
        <section aria-label="Suites" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-kumo-strong">Suites</h2>
          <DataTable>
            <Table.Header variant="compact">
              <Table.Row>
                <Table.Head>Suite</Table.Head>
                <Table.Head>Evals</Table.Head>
                <Table.Head className="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
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
                      matrix === null ? () => runSuite(suite.id) : undefined
                    }
                  />
                  {expandedSuite === suite.id ? (
                    <Table.Row>
                      <Table.Cell colSpan={3} className="bg-kumo-elevated">
                        <MatrixEvalTable
                          api={api}
                          evalIds={suite.evalIds}
                          catalog={catalog}
                          matrix={matrix}
                          runs={runs}
                          nested
                          onRun={runEval}
                          onOpenEval={onOpenEval}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ) : null}
                </Fragment>
              ))}
            </Table.Body>
          </DataTable>
        </section>
      ) : null}
      {standalone.length > 0 ? (
        <section aria-label="Standalone evals" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-kumo-strong">
            Standalone evals
          </h2>
          <MatrixEvalTable
            api={api}
            evalIds={standalone.map((evaluation) => evaluation.id)}
            catalog={catalog}
            matrix={matrix}
            runs={runs}
            onRun={runEval}
            onOpenEval={onOpenEval}
          />
        </section>
      ) : null}
    </>
  );
}
