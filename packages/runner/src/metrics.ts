import {
  recordError,
  turnTokens,
  type EvalDefinition,
  type JudgeRunInfo,
  type MetricResult,
  type ScoringContext,
  type TrajectoryEvent,
} from '@evalkit/core';

/**
 * What EvalKit measures for every run: from its trajectory, the agent's time
 * (first event to the last one before final scoring), tokens when the agent
 * reported usage, and tool calls; from its scores and checkpoints, the
 * tokens its judges used, kept apart from the agent's.
 */
export function builtInMetrics(
  events: readonly TrajectoryEvent[],
  verdicts: readonly { judge?: JudgeRunInfo }[] = [],
): MetricResult[] {
  const times = events
    .filter((event) => !event.kind.startsWith('scorer-'))
    .map((event) => Date.parse(event.timestamp))
    .filter((time) => !Number.isNaN(time));
  const metrics: MetricResult[] = [];
  if (times.length)
    metrics.push({
      name: 'agent time',
      value: Math.max(...times) - Math.min(...times),
      unit: 'ms',
      better: 'lower',
      builtIn: true,
    });
  let tokens: number | undefined;
  for (const event of events)
    if (
      event.source === 'aut' &&
      event.kind === 'turn-completed' &&
      event.usage
    ) {
      const turn = turnTokens(event.usage);
      if (turn !== undefined) tokens = (tokens ?? 0) + turn;
    }
  if (tokens !== undefined)
    metrics.push({
      name: 'tokens',
      value: tokens,
      unit: 'tokens',
      better: 'lower',
      builtIn: true,
    });
  metrics.push({
    name: 'tool calls',
    value: events.filter(
      (event) => event.source === 'aut' && event.kind === 'tool-call',
    ).length,
    builtIn: true,
  });
  let judgeTokens: number | undefined;
  for (const verdict of verdicts) {
    const used = verdict.judge?.usage && turnTokens(verdict.judge.usage);
    if (used !== undefined) judgeTokens = (judgeTokens ?? 0) + used;
  }
  if (judgeTokens !== undefined)
    metrics.push({
      name: 'judge tokens',
      value: judgeTokens,
      unit: 'tokens',
      better: 'lower',
      builtIn: true,
    });
  return metrics;
}

/** Runs the scenario's metrics; a failing metric records its error and the rest still run. */
export async function evaluateMetrics(
  definition: EvalDefinition,
  context: ScoringContext,
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  for (const entry of definition.metrics ?? []) {
    const shape = {
      name: entry.name,
      ...(entry.unit ? { unit: entry.unit } : {}),
      ...(entry.better ? { better: entry.better } : {}),
    };
    try {
      const value = await entry.run(context);
      if (value !== undefined && !Number.isFinite(value))
        throw new Error(
          `Metric ${entry.name} must return a finite number or undefined; got ${String(value)}`,
        );
      results.push({ ...shape, ...(value === undefined ? {} : { value }) });
    } catch (error) {
      results.push({ ...shape, error: recordError(error) });
    }
  }
  return results;
}
