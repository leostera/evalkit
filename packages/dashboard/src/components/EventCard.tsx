import type { TrajectoryEvent } from '../api.js';
import { eventLabel } from './eventLabel.js';
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
    <article className="card">
      <small>
        #{index + 1} · {new Date(event.timestamp).toLocaleTimeString()} ·{' '}
        {event.source}
      </small>
      <h2>{eventLabel(event)}</h2>
      {'content' in event ? (
        <pre>
          {typeof event.content === 'string'
            ? event.content
            : JSON.stringify(event.content, null, 2)}
        </pre>
      ) : null}
      {'error' in event ? (
        <pre>{JSON.stringify(event.error, null, 2)}</pre>
      ) : null}
      {fields.length ? (
        <table className="event-fields">
          <tbody>
            {fields.map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>
                  {typeof value === 'string'
                    ? value
                    : JSON.stringify(value, null, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </article>
  );
}
