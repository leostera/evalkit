import { Badge } from '@cloudflare/kumo';
import { outcomeFill, type Outcome } from './status-colors.js';

type Status =
  | 'running'
  | 'passed'
  | 'failed'
  | 'errored'
  | 'limited'
  | 'cancelled'
  | 'error'
  | 'skipped'
  | (string & {});

/** Verdict statuses, which are not run outcomes. */
const verdictVariants: Record<string, 'success' | 'error' | 'warning'> = {
  passed: 'success',
  failed: 'error',
  error: 'warning',
};

const isOutcome = (status: string): status is Outcome => status in outcomeFill;

/**
 * The status word is always rendered, so state never depends on color alone.
 * A run's outcome takes its dot from `outcomeFill`, so a status has one color
 * across badges, dots and the scoreboard; Kumo's dot colors have no purple
 * for `limited`, and its warning dot is orange where `errored` is yellow.
 */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex" data-status={status}>
      {isOutcome(status) ? (
        // A variant without a dot color, so the only dot is ours.
        <Badge appearance="dot" variant="beta">
          <span
            aria-hidden="true"
            className={`size-1.75 shrink-0 rounded-full ${outcomeFill[status]}`}
          />
          {status}
        </Badge>
      ) : (
        <Badge appearance="dot" variant={verdictVariants[status] ?? 'neutral'}>
          {status}
        </Badge>
      )}
    </span>
  );
}
