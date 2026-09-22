import { useEffect, useState } from 'react';
import type { DashboardApi, TrajectoryEvent } from '../api.js';
import type { SelectedTrial } from './types.js';
import { ArtifactRow } from './ArtifactRow.js';
import { Empty } from './Empty.js';
import { EventCard } from './EventCard.js';
export function TrialDetail({
  api,
  selected,
  evalName,
  onWorkspace,
}: {
  api: DashboardApi;
  selected?: SelectedTrial;
  evalName?: string;
  onWorkspace(): void;
}) {
  const [events, setEvents] = useState<TrajectoryEvent[]>([]);
  const [detail, setDetail] = useState<{
    manifest: unknown;
    summary: unknown;
  }>();
  const [artifacts, setArtifacts] = useState<
    Array<{ path: string; kind: string; size?: number }>
  >([]);
  useEffect(() => {
    if (!selected) return;
    void Promise.all([
      api.getTrialEvents(selected.run.id, selected.trial.id),
      api.getTrial(selected.run.id, selected.trial.id),
      api.listArtifacts(selected.run.id, selected.trial.id),
    ]).then(([nextEvents, nextDetail, nextArtifacts]) => {
      setEvents(nextEvents);
      setDetail(nextDetail);
      setArtifacts(nextArtifacts);
    });
  }, [api, selected]);
  if (!selected)
    return <Empty message="Select a trial from a run to inspect it." />;
  return (
    <section className="trial-inspector">
      <aside className="trial-overview">
        <p className="mono">trial / {selected.trial.id}</p>
        <h2>Trial overview</h2>
        <button onClick={onWorkspace}>Open candidate workspace →</button>
        <dl className="metadata-list">
          <dt>run</dt>
          <dd>{selected.run.id}</dd>
          <dt>eval</dt>
          <dd>{evalName ?? 'Unnamed eval'}</dd>
          <dt>trial number</dt>
          <dd>{selected.trial.index + 1}</dd>
          <dt>status</dt>
          <dd>{selected.trial.status}</dd>
          <dt>aggregate score</dt>
          <dd>{selected.trial.score ?? '—'}</dd>
          <dt>runtime</dt>
          <dd>
            {selected.trial.durationMs === undefined
              ? '—'
              : `${selected.trial.durationMs}ms`}
          </dd>
          <dt>events</dt>
          <dd>{events.length}</dd>
        </dl>
        <h3>Scoring</h3>
        <table className="compact-table">
          <thead>
            <tr>
              <th>Scorer</th>
              <th>Value</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {selected.trial.scores.map((score) => (
              <tr key={score.name}>
                <td>{score.name}</td>
                <td>{score.value ?? '—'}</td>
                <td>{score.passed ? 'passed' : 'failed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {artifacts.length ? (
          <>
            <h3>Artifacts</h3>
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Kind</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((artifact) => (
                  <ArtifactRow key={artifact.path} artifact={artifact} />
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        {detail ? (
          <details className="raw-details">
            <summary>Raw trial summary</summary>
            <pre>{JSON.stringify(detail.summary, null, 2)}</pre>
          </details>
        ) : null}
      </aside>
      <section className="timeline">
        <div className="timeline-heading">
          <h2>Event timeline</h2>
          <span className="mono">{events.length} events</span>
        </div>
        {events.map((event, index) => (
          <EventCard
            event={event}
            index={index}
            key={`${event.timestamp}-${index}`}
          />
        ))}
      </section>
    </section>
  );
}
