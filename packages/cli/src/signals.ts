import { constants } from 'node:os';

/** Signals that end a command the way Ctrl+C does: a timeout, a CI cancellation, `kill`, a closed terminal. */
export const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
export type StopSignal = (typeof STOP_SIGNALS)[number];

/** The shell's exit status for a process ended by `signal`: 128 plus its number. */
export function signalExitCode(signal: StopSignal): number {
  return 128 + constants.signals[signal];
}

/**
 * Exits through `process.exit` on SIGTERM and SIGHUP, which Node otherwise
 * ends without running exit hooks, so processes and fixtures a run started
 * are still stopped. Returns a function that removes the handlers.
 */
export function exitOnStopSignals(): () => void {
  const handlers = (['SIGTERM', 'SIGHUP'] as const).map((signal) => {
    const handler = () => process.exit(signalExitCode(signal));
    process.on(signal, handler);
    return () => process.off(signal, handler);
  });
  return () => {
    for (const remove of handlers) remove();
  };
}
