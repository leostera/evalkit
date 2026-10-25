import { Badge } from '@cloudflare/kumo';

type Status =
  | 'running'
  | 'passed'
  | 'failed'
  | 'errored'
  | 'error'
  | 'skipped'
  | (string & {});

/**
 * The status word is always rendered, so state never depends on color alone.
 * Execution errors stay distinct from scoring failures.
 */
const variants: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  passed: 'success',
  failed: 'error',
  errored: 'warning',
  error: 'warning',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex" data-status={status}>
      <Badge appearance="dot" variant={variants[status] ?? 'neutral'}>
        {status}
      </Badge>
    </span>
  );
}
