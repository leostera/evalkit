import {
  recordError,
  type EvalDefinition,
  type JudgeRunInfo,
  type MetricResult,
  type RunEvent,
  type ScoringContext,
  type Transcript,
  type Usage,
} from '@evalkit/core';
import { reportedUsages, usageMetrics } from '@evalkit/core/usage';

/**
 * What EvalKit measures for every run: from its transcript and events, the
 * agent's time (from the first record or event to the last one before
 * final scoring), its token metrics when it reported usage (`tokens`
 * without cache reads, `cached tokens`, `output tokens`, `cache hit
 * rate`), its steps (assistant messages) and tool calls, sub-agents'
 * included; from its scores and checkpoints, the tokens its judges used,
 * kept apart from the agent's.
 */
export function builtInMetrics(
  transcript: Transcript,
  runEvents: readonly RunEvent[],
  verdicts: readonly { judge?: JudgeRunInfo }[] = [],
  subagents: readonly Transcript[] = [],
): MetricResult[] {
  const times = [
    ...transcript.records.map((record) => record.time),
    ...runEvents
      .filter((event) => !event.kind.startsWith('scorer-'))
      .map((event) => event.timestamp),
  ]
    .map((time) => Date.parse(time))
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
  const all = [transcript, ...subagents];
  metrics.push(...usageMetrics(all.flatMap(reportedUsages)));
  let steps = 0;
  let calls = 0;
  for (const record of all.flatMap((entry) => entry.records))
    if (record.type === 'message' && record.role === 'assistant') {
      steps += 1;
      calls += record.content.filter(
        (block) => block.type === 'tool_call',
      ).length;
    }
  metrics.push(
    { name: 'steps', value: steps, better: 'lower', builtIn: true },
    { name: 'tool calls', value: calls, builtIn: true },
  );
  const judgeUsages: Usage[] = verdicts.flatMap((verdict) =>
    verdict.judge?.transcript
      ? reportedUsages(verdict.judge.transcript)
      : verdict.judge?.usage
        ? [verdict.judge.usage]
        : [],
  );
  const judgeTokens = usageMetrics(judgeUsages).find(
    (metric) => metric.name === 'tokens',
  );
  if (judgeTokens) metrics.push({ ...judgeTokens, name: 'judge tokens' });
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
