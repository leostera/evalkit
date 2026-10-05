import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CatalogEval, DashboardApi, SuiteSummary } from '../api.js';
import type { SelectedTrial } from './types.js';
import { TrialDetail } from './TrialDetail.js';
import { WorkspaceDetail } from './WorkspaceDetail.js';

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
  onTrialView,
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
  onTrialView(): void;
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
  const runSearch = new URLSearchParams(location.search);
  runSearch.delete('trial');
  runSearch.delete('view');
  const runHref = `${location.pathname}${runSearch.size ? `?${runSearch}` : ''}`;

  return (
    <dialog
      ref={dialog}
      className="trial-panel"
      aria-label={workspace ? 'Candidate workspace' : 'Trial details'}
      onClose={onClose}
    >
      <div className="trial-panel-header">
        <div className="trial-panel-heading">
          <nav aria-label="Trial path" className="trial-breadcrumbs">
            {suite ? (
              <Link to={`/suites/${encodeURIComponent(suite.id)}`}>
                {suite.name ?? suite.id}
              </Link>
            ) : (
              <Link to="/runs">Runs</Link>
            )}
            <span aria-hidden="true">/</span>
            {evaluation ? (
              <Link to={`/evals/${encodeURIComponent(evaluation.path)}`}>
                {evaluation.name ?? evaluation.id}
              </Link>
            ) : (
              <span>{selected?.run.evalId ?? 'Eval'}</span>
            )}
            <span aria-hidden="true">/</span>
            <Link to={runHref}>Run {selected?.run.id.slice(0, 8) ?? '…'}</Link>
            <span aria-hidden="true">/</span>
            {workspace ? (
              <>
                <button type="button" onClick={onTrialView}>
                  Trial {selected ? selected.trial.index + 1 : '…'}
                </button>
                <span aria-hidden="true">/</span>
                <span aria-current="page">Workspace</span>
              </>
            ) : (
              <span aria-current="page">
                Trial {selected ? selected.trial.index + 1 : '…'}
              </span>
            )}
          </nav>
          <h2>
            {workspace
              ? 'Candidate workspace'
              : `Trial ${selected ? selected.trial.index + 1 : '…'}`}
          </h2>
          <p className="mono">{trialId}</p>
        </div>
        <button
          type="button"
          className="trial-panel-close"
          aria-label="Close trial panel"
          title="Close trial panel"
          onClick={() => dialog.current?.close()}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="trial-panel-body">
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
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <output>Loading trial…</output>
        )}
      </div>
    </dialog>
  );
}
