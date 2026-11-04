import type {
  CheckpointResult,
  EvalDefinition,
  EvalMatrixCell,
  RunResult,
  ScoreResult,
} from '@evalkit/core';
import { authoringId, passMark } from '@evalkit/core';
import { formatLimit } from '@evalkit/core/limits';
import { firstLine } from './dashboard-reports.js';
import type { RunRef, RunUpdate } from '@evalkit/runner';
import {
  bold,
  cyan,
  dim,
  duration,
  green,
  plural,
  red,
  yellow,
} from './terminal.js';

/** How one finished run ended; a run that errored counts as failed, one stopped at a limit as limited. */
export type RunOutcome = 'passed' | 'failed' | 'limited' | 'cancelled';

/** One finished run, as the CLI prints and counts it. */
export type RunReport = {
  /** `suite/eval`, or the eval ID when it has no suite. */
  label: string;
  evalId: string;
  suiteId?: string;
  parameters: Record<string, unknown>;
  outcome: RunOutcome;
  durationMs?: number;
  result: RunResult;
  /** Short reasons, one per failing score or checkpoint, e.g. `correct 0.0 (passes at 0.5)`. */
  reasons: string[];
  /** Scores that returned skip(). */
  skipped: string[];
};

/** Runs by outcome, and how many scenarios (with their parameters) they covered. */
export type RunTotals = {
  passed: number;
  failed: number;
  limited: number;
  cancelled: number;
  runs: number;
  scenarios: number;
  durationMs: number;
};

export function runOutcome(result: RunResult): RunOutcome {
  if (result.status === 'cancelled') return 'cancelled';
  if (result.status === 'limited') return 'limited';
  return result.status === 'passed' ? 'passed' : 'failed';
}

function value(score: { value?: number }): string {
  return score.value === undefined ? '' : score.value.toFixed(1);
}

/**
 * One failed verdict in words: `history 0.0 (passes at 1): got 2 entries`,
 * or for a choices judge `Correctness C (passes at A or B): wrong product`.
 */
export function verdictReason(
  definition: EvalDefinition,
  verdict: Pick<
    ScoreResult,
    'name' | 'value' | 'passAt' | 'choice' | 'explanation' | 'criteria'
  >,
): string {
  const rule = [...definition.transcript, ...definition.scoring].find(
    (step) => step.kind === 'judge' && step.name === verdict.name,
  );
  const answer = rule?.kind === 'judge' ? rule.answer : undefined;
  const mark =
    verdict.passAt === undefined
      ? ''
      : answer?.kind === 'choices'
        ? ` (passes at ${passMark(verdict.passAt, answer)})`
        : ` (passes at ${verdict.passAt})`;
  const why = [criteriaReason(verdict.criteria), firstLine(verdict.explanation)]
    .filter(Boolean)
    .join(' · ');
  return `${verdict.name} ${verdict.choice ?? value(verdict)}${mark}${why ? `: ${why}` : ''}`;
}

/**
 * Which criteria let the score down, so seven checks the app never reached
 * read as one cause (`not reached: saves, history`), not seven failures.
 */
function criteriaReason(criteria: ScoreResult['criteria']): string {
  if (!criteria?.length) return '';
  const failed = criteria.filter(
    (criterion) => 'value' in criterion && criterion.value < 1,
  );
  const unreached = criteria.filter((criterion) => !('value' in criterion));
  return [
    failed.length
      ? `failed ${failed
          .map((criterion) => {
            const why = firstLine(criterion.explanation, 60);
            return why ? `${criterion.name} (${why})` : criterion.name;
          })
          .join(', ')}`
      : '',
    unreached.length
      ? `not reached ${unreached.map((criterion) => criterion.name).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function scoreReason(definition: EvalDefinition, score: ScoreResult): string {
  if (score.error)
    return `${score.name} error: ${firstLine(score.error.message)}`;
  return verdictReason(definition, score);
}

function checkpointReason(
  definition: EvalDefinition,
  checkpoint: CheckpointResult,
): string {
  if (checkpoint.status === 'error')
    return `step ${checkpoint.step} ${checkpoint.name} error: ${firstLine(checkpoint.error?.message)}`;
  if (checkpoint.value === undefined && !checkpoint.choice)
    return `step ${checkpoint.step} ${checkpoint.name} ${checkpoint.status}`;
  return `step ${checkpoint.step} ${verdictReason(definition, checkpoint)}`;
}

/** What went wrong in a run. */
function reasonsFor(
  definition: EvalDefinition,
  run: RunResult,
): { reasons: string[]; skipped: string[] } {
  const reasons = new Set<string>();
  const skipped = new Set<string>();
  if (run.status === 'errored' && run.error)
    reasons.add(`error: ${firstLine(run.error.message, 160)}`);
  for (const checkpoint of run.scoring?.checkpoints ?? [])
    if (checkpoint.status === 'failed' || checkpoint.status === 'error')
      reasons.add(checkpointReason(definition, checkpoint));
  for (const score of run.scoring?.results ?? []) {
    if (score.skipped) skipped.add(score.name);
    else if (!score.passed) reasons.add(scoreReason(definition, score));
  }
  for (const name of run.scoring?.skippedScorers ?? [])
    if (run.status !== 'cancelled') reasons.add(`${name} not run`);
  return { reasons: [...reasons], skipped: [...skipped] };
}

export function runReport(
  cell: EvalMatrixCell,
  result: RunResult,
  suiteId: string | undefined,
): RunReport {
  const evalId = authoringId(cell.eval);
  return {
    label: suiteId ? `${suiteId}/${evalId}` : evalId,
    evalId,
    ...(suiteId ? { suiteId } : {}),
    parameters: cell.parameters,
    outcome: runOutcome(result),
    ...(result.durationMs !== undefined
      ? { durationMs: result.durationMs }
      : {}),
    result,
    ...reasonsFor(cell.eval, result),
  };
}

export function parameterLabel(parameters: Record<string, unknown>): string {
  return Object.entries(parameters)
    .map(
      ([key, item]) =>
        `${key}=${typeof item === 'string' ? item : JSON.stringify(item)}`,
    )
    .join(' ');
}

/** One printed line for a finished run; failing reasons on the same line. */
export function runLine(scenario: RunReport): string {
  const mark =
    scenario.outcome === 'passed'
      ? green('✓')
      : scenario.outcome === 'cancelled'
        ? yellow('◌')
        : scenario.outcome === 'limited'
          ? yellow('✗')
          : red('✗');
  const parameters = parameterLabel(scenario.parameters);
  const batch = scenario.result.batch;
  const position = batch ? dim(` #${batch.index + 1}/${batch.size}`) : '';
  const details = [
    ...(scenario.outcome === 'limited' ? [limitReason(scenario.result)] : []),
    ...(scenario.outcome === 'failed' || scenario.outcome === 'limited'
      ? scenario.reasons
      : []),
    ...(scenario.outcome === 'cancelled' ? ['cancelled'] : []),
    ...scenario.skipped.map((name) => `${name} skipped`),
  ];
  return `  ${mark} ${bold(scenario.label)}${parameters ? ` ${dim(parameters)}` : ''}${position}${details.length ? `   ${dim(details.join(' · '))}` : ''}`;
}

/** `limited: 41 of 40 steps · score 0.40 (graded what it left)`. */
export function limitReason(result: RunResult): string {
  const limit = result.limit;
  if (!limit) return 'limited';
  const used =
    limit.limit === 'time'
      ? `${formatLimit('time', Math.round(limit.used / 1000) * 1000)} of ${formatLimit('time', limit.value)}`
      : `${limit.used.toLocaleString('en-US')} of ${formatLimit(limit.limit, limit.value)}`;
  const overall = result.scoring?.overall;
  return `limited: ${used}${overall === undefined || !result.scoring?.results.length ? '' : ` · score ${overall.toFixed(2)} (graded what it left)`}`;
}

type Activity = { label: string; startedAt: number; doing?: string };

/**
 * Prints run progress. On a terminal, failures print as they happen and a live
 * line shows counts and what is running. Elsewhere (CI), every finished
 * scenario prints one plain line.
 */
export function createRunReporter(options: {
  interactive: boolean;
  verbose: boolean;
  total: number;
  labelFor: (run: RunRef) => string;
  write?: (text: string) => void;
  now?: () => number;
}) {
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const now = options.now ?? (() => performance.now());
  const running = new Map<string, Activity>();
  const scenarios: RunReport[] = [];
  let liveShown = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function clearLive() {
    if (liveShown) write('\r\x1b[2K');
    liveShown = false;
  }

  function liveLine(): string {
    const failed = scenarios.filter((s) => s.outcome === 'failed').length;
    const active = [...running.values()].slice(0, 2).map((activity) => {
      const seconds = Math.round((now() - activity.startedAt) / 1000);
      return `${activity.label} (${activity.doing ? `${activity.doing}, ` : ''}${seconds}s)`;
    });
    const more = running.size > 2 ? ', …' : '';
    return `  ${cyan('◇')} ${scenarios.length}/${options.total}${failed ? ` · ${red(`${failed} failed`)}` : ''}${active.length ? dim(` · running: ${active.join(', ')}${more}`) : ''}`;
  }

  function drawLive() {
    if (!options.interactive) return;
    const line = liveLine();
    const width = process.stdout.columns ?? 120;
    write(
      `\r\x1b[2K${line.length > width + 40 ? line.slice(0, width + 40) : line}`,
    );
    liveShown = true;
  }

  function print(line: string) {
    clearLive();
    write(`${line}\n`);
    drawLive();
  }

  return {
    start() {
      if (options.interactive) {
        timer = setInterval(drawLive, 100);
        timer.unref?.();
      }
    },
    onUpdate(run: RunRef, update: RunUpdate) {
      if (update.kind === 'record') {
        const activity = running.get(run.runId);
        const call =
          update.record.type === 'message' && update.record.role === 'assistant'
            ? update.record.content
                .filter((block) => block.type === 'tool_call')
                .at(-1)
            : undefined;
        if (activity && call?.type === 'tool_call')
          activity.doing = `tool ${call.name}`;
        return;
      }
      const event = update.event;
      if (event.kind === 'run-started') {
        running.set(run.runId, {
          label: options.labelFor(run),
          startedAt: now(),
        });
        return;
      }
      const activity = running.get(run.runId);
      if (!activity) return;
      if (event.kind === 'run-completed' || event.kind === 'error')
        running.delete(run.runId);
      else if (event.kind === 'limit-reached')
        activity.doing = `stopping at its ${event.limit} limit`;
      else if (event.kind === 'scorer-started')
        activity.doing = `scoring ${event.scorer}`;
      else if (event.kind === 'checkpoint-started')
        activity.doing = `check ${event.name}`;
    },
    onRun(scenario: RunReport) {
      scenarios.push(scenario);
      running.delete(scenario.result.runId);
      if (
        !options.interactive ||
        options.verbose ||
        scenario.outcome !== 'passed'
      )
        print(runLine(scenario));
    },
    /** Called on the first Ctrl+C. */
    cancelling() {
      print(
        `\n  ${yellow('◌')} Cancelling: finishing running runs. Press Ctrl+C again to exit now.`,
      );
    },
    finish(durationMs: number): RunTotals {
      if (timer) clearInterval(timer);
      clearLive();
      const totals: RunTotals = {
        passed: scenarios.filter((s) => s.outcome === 'passed').length,
        failed: scenarios.filter((s) => s.outcome === 'failed').length,
        limited: scenarios.filter((s) => s.outcome === 'limited').length,
        cancelled: scenarios.filter((s) => s.outcome === 'cancelled').length,
        runs: scenarios.length,
        scenarios: new Set(
          scenarios.map((s) => `${s.label} ${parameterLabel(s.parameters)}`),
        ).size,
        durationMs,
      };
      return totals;
    },
    runs: () => scenarios,
  };
}

export function totalsLine(totals: RunTotals): string {
  const parts = [
    green(`${totals.passed} passed`),
    totals.failed ? red(`${totals.failed} failed`) : '',
    totals.limited ? yellow(`${totals.limited} limited`) : '',
    totals.cancelled ? yellow(`${totals.cancelled} cancelled`) : '',
  ].filter(Boolean);
  const coverage =
    totals.runs === totals.scenarios
      ? plural(totals.runs, 'run')
      : `${plural(totals.runs, 'run')} of ${plural(totals.scenarios, 'scenario')}`;
  return `  ${bold(parts.join(' · '))} ${dim(`· ${coverage} in ${duration(totals.durationMs)}`)}`;
}
