import { Breadcrumbs, Button } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { CatalogEval, DashboardApi, SuiteSummary } from '../api.js';
import { monoClass } from './DataTable.js';
import { ErrorBanner } from './ErrorBanner.js';
import type { SelectedTrial } from './types.js';
import { TrialDetail } from './TrialDetail.js';
import { WorkspaceDetail } from './WorkspaceDetail.js';

/**
 * Trial evidence in a modal side sheet over the run table, so the run's URL
 * filters stay in place. The native dialog provides focus trapping and Escape.
 */
export function TrialPanel({
  api,
  catalog,
  suites,
  selected,
  trialId,
  error,
  workspace,
  onClose,
  onWorkspace,
}: {
  api: DashboardApi;
  catalog: CatalogEval[];
  suites: SuiteSummary[];
  selected?: SelectedTrial;
  trialId: string;
  error?: string;
  workspace: boolean;
  onClose(): void;
  onWorkspace(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);

  const evaluation = catalog.find((entry) => entry.id === selected?.run.evalId);
  const suite = suites.find((entry) => entry.id === selected?.run.suiteId);
  const runHref = hrefWithout(location, ['trial', 'view']);
  const trialHref = hrefWithout(location, ['view']);
  const trialLabel = `Trial ${selected ? selected.trial.index + 1 : '…'}`;

  return (
    <dialog
      ref={dialog}
      className="trial-panel fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[min(1100px,100vw)] border-l border-kumo-line bg-kumo-base p-0 text-kumo-default shadow-xl backdrop:bg-black/30"
      aria-label={workspace ? 'Candidate workspace' : 'Trial details'}
      onClose={onClose}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start gap-3 border-b border-kumo-line px-5 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Breadcrumbs size="sm" className="trial-breadcrumbs">
              {suite ? (
                <Breadcrumbs.Link
                  href={`/suites/${encodeURIComponent(suite.id)}`}
                >
                  {suite.name ?? suite.id}
                </Breadcrumbs.Link>
              ) : (
                <Breadcrumbs.Link href="/runs">Runs</Breadcrumbs.Link>
              )}
              <Breadcrumbs.Separator />
              {evaluation ? (
                <Breadcrumbs.Link
                  href={`/evals/${encodeURIComponent(evaluation.path)}`}
                >
                  {evaluation.name ?? evaluation.id}
                </Breadcrumbs.Link>
              ) : (
                <Breadcrumbs.Current>
                  {selected?.run.evalId ?? 'Eval'}
                </Breadcrumbs.Current>
              )}
              <Breadcrumbs.Separator />
              <Breadcrumbs.Link href={runHref}>
                Run {selected?.run.id.slice(0, 8) ?? '…'}
              </Breadcrumbs.Link>
              <Breadcrumbs.Separator />
              {workspace ? (
                <Breadcrumbs.Link href={trialHref}>
                  {trialLabel}
                </Breadcrumbs.Link>
              ) : (
                <Breadcrumbs.Current>{trialLabel}</Breadcrumbs.Current>
              )}
              {workspace ? <Breadcrumbs.Separator /> : null}
              {workspace ? (
                <Breadcrumbs.Current>Workspace</Breadcrumbs.Current>
              ) : null}
            </Breadcrumbs>
            <h2 className="text-base font-semibold text-kumo-strong">
              {workspace ? 'Candidate workspace' : trialLabel}
            </h2>
            <p className={`${monoClass} truncate text-kumo-subtle`}>
              {trialId}
            </p>
          </div>
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            className="trial-panel-close"
            aria-label="Close trial panel"
            title="Close trial panel"
            icon={<XIcon />}
            onClick={() => dialog.current?.close()}
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {selected ? (
            workspace ? (
              <WorkspaceDetail api={api} selected={selected} />
            ) : (
              <TrialDetail
                api={api}
                selected={selected}
                evalName={evaluation?.name ?? selected.run.evalId}
                onWorkspace={onWorkspace}
              />
            )
          ) : error ? (
            <ErrorBanner message={error} />
          ) : (
            <output className="text-[13px] text-kumo-subtle">
              Loading trial…
            </output>
          )}
        </div>
      </div>
    </dialog>
  );
}

function hrefWithout(
  location: { pathname: string; search: string },
  keys: readonly string[],
): string {
  const search = new URLSearchParams(location.search);
  for (const key of keys) search.delete(key);
  return `${location.pathname}${search.size ? `?${search}` : ''}`;
}
