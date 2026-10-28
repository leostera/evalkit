import type { EvalMatrixCell, RunResult } from '@evalkit/core';
import { authoringId } from '@evalkit/core';
import { Effect, Logger, LogLevel } from 'effect';

/** Human CLI output. Colors and live progress only appear on an interactive terminal. */
const interactive = Boolean(process.stdout.isTTY);
const colored =
  interactive && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

const paint = (code: number, reset: number) => (text: string) =>
  colored ? `\x1b[${code}m${text}\x1b[${reset}m` : text;
export const bold = paint(1, 22);
export const dim = paint(2, 22);
export const red = paint(31, 39);
export const green = paint(32, 39);
export const yellow = paint(33, 39);
export const cyan = paint(36, 39);

export function banner(command: string, version: string): void {
  console.log(
    `\n  ${bold(cyan('EvalKit'))} ${bold(command)} ${dim(`v${version}`)}\n`,
  );
}

export function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} kB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Times one build step, showing a live line while it runs. */
export async function step<T>(
  label: string,
  work: (progress: (detail: string) => void) => Promise<T>,
  describe: (value: T) => string,
): Promise<T> {
  const started = performance.now();
  const progress = (detail: string) => {
    if (interactive)
      process.stdout.write(
        `\r\x1b[2K  ${cyan('◇')} ${label.padEnd(20)} ${dim(detail)}`,
      );
  };
  progress('…');
  try {
    const value = await work(progress);
    const elapsed = duration(performance.now() - started);
    if (interactive) process.stdout.write('\r\x1b[2K');
    console.log(
      `  ${green('✓')} ${label.padEnd(20)} ${describe(value)} ${dim(elapsed)}`,
    );
    return value;
  } catch (error) {
    if (interactive) process.stdout.write('\r\x1b[2K');
    console.log(`  ${red('✗')} ${label}`);
    throw error;
  }
}

function clock(): string {
  return dim(new Date().toTimeString().slice(0, 8));
}

function cellLabel(name: string, parameters: object): string {
  const shown = Object.entries(parameters)
    .map(
      ([key, value]) =>
        `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
    )
    .join(' ');
  return shown ? `${bold(name)} ${dim(shown)}` : bold(name);
}

export function passed(result: RunResult): boolean {
  return (
    result.status === 'completed' &&
    (result.aggregateScoring?.passRate === 1 || Boolean(result.scoring?.passed))
  );
}

/** Live log for runs launched from the `evalkit dev` dashboard. */
export const runLog = {
  started(name: string, parameters: object = {}, suiteId?: string): void {
    const suite = suiteId ? dim(` (suite ${suiteId})`) : '';
    console.log(
      `${clock()}  ${cyan('▶ run ')} ${cellLabel(name, parameters)}${suite}`,
    );
  },
  finished(
    name: string,
    parameters: object,
    result: RunResult,
    ms: number,
  ): void {
    const ok = passed(result);
    const trials = result.trials?.length ?? 1;
    const passedTrials = result.aggregateScoring?.passed ?? (ok ? trials : 0);
    const status =
      result.status === 'completed'
        ? ok
          ? green('✓ pass')
          : red('✗ fail')
        : red(`✗ ${result.status}`);
    console.log(
      `${clock()}  ${status} ${cellLabel(name, parameters)} ${dim(`${passedTrials}/${trials} trials · ${duration(ms)}`)}`,
    );
    console.log(`          ${dim(`report ${result.reportLocation}`)}`);
  },
  cell(cell: EvalMatrixCell, result: RunResult, ms: number): void {
    runLog.finished(
      cell.eval.name ?? authoringId(cell.eval),
      cell.parameters,
      result,
      ms,
    );
  },
  failed(name: string, error: unknown): void {
    console.log(
      `${clock()}  ${red('✗ error')} ${bold(name)} ${error instanceof Error ? error.message : String(error)}`,
    );
  },
};

/**
 * The runner logs structured Effect lines; the CLI prints its own summaries, so
 * only warnings show by default. `EVALKIT_LOG_LEVEL=info` (or `debug`) restores them.
 */
export function runnerLogs<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const requested = process.env.EVALKIT_LOG_LEVEL?.toLowerCase();
  const level =
    LogLevel.allLevels.find((item) => item.label.toLowerCase() === requested) ??
    LogLevel.Warning;
  return effect.pipe(Logger.withMinimumLogLevel(level));
}

/** True when a person can answer a prompt (not CI, pipes, or redirected input). */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function confirm(question: string): Promise<boolean> {
  const { createInterface } = await import('node:readline/promises');
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await prompt.question(
      `  ${cyan('?')} ${question} ${dim('(y/N)')} `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } catch {
    // Ctrl+D or closed input answers "no".
    console.log('');
    return false;
  } finally {
    prompt.close();
  }
}
