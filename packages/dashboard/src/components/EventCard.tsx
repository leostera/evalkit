import type { TrajectoryEvent } from '../api.js';
import { eventLabel } from './eventLabel.js';

const preClass =
  'overflow-x-auto rounded-md bg-kumo-elevated px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-kumo-default';

function text(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function EventCard({
  event,
  index,
}: {
  event: TrajectoryEvent;
  index: number;
}) {
  const fields = Object.entries(event).filter(
    ([key]) =>
      !['source', 'kind', 'timestamp', 'content', 'error'].includes(key),
  );
  return (
    <article className="event-card flex flex-col gap-2 rounded-lg border border-kumo-line bg-kumo-base px-3 py-2.5">
      <header className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-kumo-subtle tabular-nums">
          #{index + 1}
        </span>
        <h3 className="text-[13px] font-semibold text-kumo-strong">
          {eventLabel(event)}
        </h3>
        <span className="ml-auto text-xs text-kumo-subtle">
          {event.source} · {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </header>
      {'content' in event ? (
        <pre className={preClass}>{text(event.content)}</pre>
      ) : null}
      {'error' in event ? (
        <pre className={`${preClass} text-kumo-danger`}>
          {text(event.error)}
        </pre>
      ) : null}
      {fields.length ? (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {fields.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-kumo-subtle">{key}</dt>
              <dd className="font-mono break-words whitespace-pre-wrap">
                {text(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
