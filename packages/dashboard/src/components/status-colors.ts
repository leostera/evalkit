import type { RunSummary } from '../api.js';

/**
 * One color per outcome, used wherever results are meant to be scanned:
 * green passed, red failed, yellow errored, blue running, grey cancelled,
 * and an empty outline for never run.
 */
export type Outcome = RunSummary['status'] | 'not-run';

export const outcomeFill: Record<Outcome, string> = {
  passed: 'bg-kumo-success',
  failed: 'bg-kumo-danger',
  errored: 'bg-kumo-warning',
  running: 'bg-kumo-info animate-pulse',
  cancelled: 'bg-kumo-neutral-450',
  'not-run': 'border border-dashed border-kumo-line bg-transparent',
};

export const outcomeTint: Record<Outcome, string> = {
  passed: 'bg-kumo-success-tint',
  failed: 'bg-kumo-danger-tint',
  errored: 'bg-kumo-warning-tint',
  running: 'bg-kumo-info-tint',
  cancelled: 'bg-kumo-tint',
  'not-run': '',
};

export const outcomeLabel: Record<Outcome, string> = {
  passed: 'passed',
  failed: 'failed',
  errored: 'errored',
  running: 'running',
  cancelled: 'cancelled',
  'not-run': 'not run',
};

/** Worst first: what needs attention sorts to the top. */
export const outcomeSeverity: Record<Outcome, number> = {
  failed: 0,
  errored: 1,
  running: 2,
  cancelled: 3,
  'not-run': 4,
  passed: 5,
};

/** A pass rate's color: green from 90%, yellow from 50%, red below. */
export function rateTint(rate: number | undefined): string {
  if (rate === undefined) return 'text-kumo-subtle';
  if (rate >= 0.9) return 'bg-kumo-success-tint';
  if (rate >= 0.5) return 'bg-kumo-warning-tint';
  return 'bg-kumo-danger-tint';
}
