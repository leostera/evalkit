import type {
  CheckpointResult,
  EvalDefinition,
  EvalMatrixCell,
  RunResult,
  ScoreResult,
  TrajectoryEvent,
  TrialResult,
} from '@evalkit/core';
import { authoringId } from '@evalkit/core';
import type { TrialRef } from '@evalkit/runner';
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

/** How one finished scenario (matrix cell) ended. */
export type ScenarioOutcome = 'passed' | 'failed' | 'cancelled';

export type ScenarioResult = {
  /** `suite/eval`, or the eval ID when it has no suite. */
  label: string;
  evalId: string;
  suiteId?: string;
  parameters: Record<string, unknown>;
  outcome: ScenarioOutcome;
  durationMs?: number;
  result: RunResult;
  /** Short reasons, one per failing score or checkpoint, e.g. `correct 0.0 (passes at 0.5)`. */
  reasons: string[];
  /** Scores that returned skip(). */
  skipped: string[];
};

export type RunTotals = {
  passed: number;
  failed: number;
  cancelled: number;
  scenarios: number;
  durationMs: number;
};

export function scenarioOutcome(result: RunResult): ScenarioOutcome {
  if (result.status === 'cancelled') return 'cancelled';
  const passed =
    result.status === 'completed' &&
    (result.trials
      ? result.trials.length > 0 &&
        result.trials.every(
          (trial) => trial.status === 'completed' && trial.scoring?.passed,
        )
      : Boolean(result.scoring?.passed));
  return passed ? 'passed' : 'failed';
}

function passAtFor(
  definition: EvalDefinition,
  name: string,
): number | undefined {
  const rule = [...definition.transcript, ...definition.scoring].find(
    (step) => step.kind === 'predicate' && step.name === name,
  );
  return rule?.kind === 'predicate' ? rule.passAt : undefined;
}

function value(score: { value?: number }): string {
  return score.value === undefined ? '' : score.value.toFixed(1);
}

function scoreReason(definition: EvalDefinition, score: ScoreResult): string {
  if (score.error) return `${score.name} error: ${score.error.message}`;
  const passAt = passAtFor(definition, score.name);
  return `${score.name} ${value(score)}${passAt === undefined ? '' : ` (passes at ${passAt})`}`;
}

function checkpointReason(
  definition: EvalDefinition,
  checkpoint: CheckpointResult,
): string {
  if (checkpoint.status === 'error')
    return `step ${checkpoint.step} ${checkpoint.name} error: ${checkpoint.error?.message ?? ''}`;
  const passAt = passAtFor(definition, checkpoint.name);
  return `step ${checkpoint.step} ${checkpoint.name} ${checkpoint.value === undefined ? checkpoint.status : value(checkpoint)}${passAt === undefined ? '' : ` (passes at ${passAt})`}`;
}

/** What went wrong in a scenario, deduplicated across its trials. */
function reasonsFor(
  definition: EvalDefinition,
  trials: readonly TrialResult[],
): { reasons: string[]; skipped: string[] } {
  const reasons = new Set<string>();
  const skipped = new Set<string>();
  for (const trial of trials) {
    if (trial.status === 'failed' && trial.error)
      reasons.add(`error: ${trial.error.message}`);
    for (const checkpoint of trial.scoring?.checkpoints ?? [])
      if (checkpoint.status === 'failed' || checkpoint.status === 'error')
        reasons.add(checkpointReason(definition, checkpoint));
    for (const score of trial.scoring?.results ?? []) {
      if (score.skipped) skipped.add(score.name);
      else if (!score.passed) reasons.add(scoreReason(definition, score));
    }
    for (const name of trial.scoring?.skippedScorers ?? [])
      if (trial.status !== 'cancelled') reasons.add(`${name} not run`);
  }
  return { reasons: [...reasons], skipped: [...skipped] };
}

export function scenarioResult(
  cell: EvalMatrixCell,
  result: RunResult,
  suiteId: string | undefined,
): ScenarioResult {
  const evalId = authoringId(cell.eval);
  const trials = result.trials ?? [result];
  return {
    label: suiteId ? `${suiteId}/${evalId}` : evalId,
    evalId,
    ...(suiteId ? { suiteId } : {}),
    parameters: cell.parameters,
    outcome: scenarioOutcome(result),
    ...(result.durationMs !== undefined
      ? { durationMs: result.durationMs }
      : {}),
    result,
    ...reasonsFor(cell.eval, trials),
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

/** One printed line for a finished scenario; failing reasons on the same line. */
export function scenarioLine(scenario: ScenarioResult): string {
  const mark =
    scenario.outcome === 'passed'
      ? green('✓')
      : scenario.outcome === 'cancelled'
        ? yellow('◌')
        : red('✗');
  const parameters = parameterLabel(scenario.parameters);
  const trials = scenario.result.trials;
  const trialCount =
    trials && trials.length > 1
      ? dim(
          ` ${trials.filter((trial) => trial.status === 'completed' && trial.scoring?.passed).length}/${trials.length} trials`,
        )
      : '';
  const details = [
    ...(scenario.outcome === 'failed' ? scenario.reasons : []),
    ...(scenario.outcome === 'cancelled' ? ['cancelled'] : []),
    ...scenario.skipped.map((name) => `${name} skipped`),
  ];
  return `  ${mark} ${bold(scenario.label)}${parameters ? ` ${dim(parameters)}` : ''}${trialCount}${details.length ? `   ${dim(details.join(' · '))}` : ''}`;
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
  labelFor: (trial: TrialRef) => string;
  write?: (text: string) => void;
  now?: () => number;
}) {
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const now = options.now ?? (() => performance.now());
  const running = new Map<string, Activity>();
  const scenarios: ScenarioResult[] = [];
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
    onEvent(trial: TrialRef, event: TrajectoryEvent) {
      if (event.source === 'runner' && event.kind === 'trial-started') {
        running.set(trial.trialId, {
          label: options.labelFor(trial),
          startedAt: now(),
        });
        return;
      }
      const activity = running.get(trial.trialId);
      if (!activity) return;
      if (
        event.source === 'runner' &&
        (event.kind === 'trial-completed' || event.kind === 'error')
      ) {
        running.delete(trial.trialId);
      } else if (event.source === 'aut' && event.kind === 'tool-call')
        activity.doing = `tool ${event.name}`;
      else if (event.source === 'runner' && event.kind === 'scorer-started')
        activity.doing = `scoring ${event.scorer}`;
      else if (event.source === 'runner' && event.kind === 'checkpoint-started')
        activity.doing = `check ${event.name}`;
    },
    onScenario(scenario: ScenarioResult) {
      scenarios.push(scenario);
      for (const trial of scenario.result.trials ?? [scenario.result])
        running.delete(trial.trialId);
      if (
        !options.interactive ||
        options.verbose ||
        scenario.outcome !== 'passed'
      )
        print(scenarioLine(scenario));
    },
    /** Called on the first Ctrl+C. */
    cancelling() {
      print(
        `\n  ${yellow('◌')} Cancelling: finishing running trials. Press Ctrl+C again to exit now.`,
      );
    },
    finish(durationMs: number): RunTotals {
      if (timer) clearInterval(timer);
      clearLive();
      const totals: RunTotals = {
        passed: scenarios.filter((s) => s.outcome === 'passed').length,
        failed: scenarios.filter((s) => s.outcome === 'failed').length,
        cancelled: scenarios.filter((s) => s.outcome === 'cancelled').length,
        scenarios: scenarios.length,
        durationMs,
      };
      return totals;
    },
    scenarios: () => scenarios,
  };
}

export function totalsLine(totals: RunTotals): string {
  const parts = [
    green(`${totals.passed} passed`),
    totals.failed ? red(`${totals.failed} failed`) : '',
    totals.cancelled ? yellow(`${totals.cancelled} cancelled`) : '',
  ].filter(Boolean);
  return `  ${bold(parts.join(' · '))} ${dim(`· ${plural(totals.scenarios, 'scenario')} in ${duration(totals.durationMs)}`)}`;
}
