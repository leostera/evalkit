import type { Transcript, Usage } from '@leostera/atxf';

export type { Usage };

/**
 * Token usage as an adapter reports it: ATXF's buckets, each optional.
 * The buckets are disjoint: `input` excludes cached tokens, which are
 * `cacheRead` (read from a prompt cache) and `cacheWrite` (written to one);
 * `output` includes `reasoning`. Convert your provider's conventions: one
 * that counts cached tokens inside its prompt tokens reports
 * `input: promptTokens - cachedTokens, cacheRead: cachedTokens`.
 */
export type UsageInput = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  /** The provider's total; used only when no bucket is reported. */
  total?: number;
};

const BUCKETS = [
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
  'reasoning',
  'total',
] as const;

/** ATXF usage from what an adapter reported; undefined when it reported nothing. */
export function normalizeUsage(
  input: UsageInput | undefined,
): Usage | undefined {
  if (!input) return undefined;
  for (const key of BUCKETS) {
    const value = input[key];
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      throw new Error(
        `Usage ${key} must be a non-negative number; received ${String(value)}`,
      );
  }
  if (BUCKETS.every((key) => input[key] === undefined)) return undefined;
  return {
    input: input.input ?? 0,
    output: input.output ?? 0,
    ...(input.cacheRead === undefined ? {} : { cacheRead: input.cacheRead }),
    ...(input.cacheWrite === undefined ? {} : { cacheWrite: input.cacheWrite }),
    ...(input.reasoning === undefined ? {} : { reasoning: input.reasoning }),
    ...(input.total === undefined ? {} : { total: input.total }),
  };
}

/**
 * Tokens the model had to process: uncached input, cache writes and output.
 * Cache reads are left out; see `cachedTokens`. Usage that has only a total
 * (from a provider, or a run saved before 0.11) counts its total less any
 * cache reads.
 */
export function uncachedTokens(usage: Usage): number {
  const counted = usage.input + (usage.cacheWrite ?? 0) + usage.output;
  if (counted === 0 && usage.total !== undefined)
    return Math.max(0, usage.total - (usage.cacheRead ?? 0));
  return counted;
}

/** Input tokens read from a prompt cache. */
export function cachedTokens(usage: Usage): number {
  return usage.cacheRead ?? 0;
}

/** The share of input tokens read from a cache, 0 to 1; undefined with no input. */
export function cacheHitRate(usage: Usage): number | undefined {
  const input = usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  return input > 0 ? (usage.cacheRead ?? 0) / input : undefined;
}

/** Bucket by bucket; a bucket absent from both stays absent. */
export function addUsage(a: Usage | undefined, b: Usage | undefined) {
  if (!a) return b;
  if (!b) return a;
  const sum: Usage = { input: a.input + b.input, output: a.output + b.output };
  for (const key of ['cacheRead', 'cacheWrite', 'reasoning', 'total'] as const)
    if (a[key] !== undefined || b[key] !== undefined)
      sum[key] = (a[key] ?? 0) + (b[key] ?? 0);
  return sum;
}

/**
 * A transcript's usage as ATXF totals it: usage on assistant messages,
 * compactions and branch summaries, and usage records that are not running
 * totals. Every record counts, abandoned branches too, since they were paid
 * for. Undefined when nothing reported usage.
 */
export function transcriptUsage(transcript: Transcript): Usage | undefined {
  let total: Usage | undefined;
  for (const record of transcript.records) {
    if (record.type === 'message' && record.role === 'assistant')
      total = addUsage(total, record.usage);
    else if (record.type === 'compaction' || record.type === 'branch_summary')
      total = addUsage(total, record.usage);
    else if (record.type === 'usage' && !record.cumulative)
      total = addUsage(total, record.usage);
  }
  return total;
}

/**
 * The built-in token metrics for the usage a transcript reported, each usage
 * counted on its own and then summed; none when nothing reported usage.
 */
export function usageMetrics(usages: readonly Usage[]): Array<{
  name: string;
  value: number;
  unit?: string;
  better?: 'lower' | 'higher';
  builtIn: true;
}> {
  if (!usages.length) return [];
  const sum = (read: (usage: Usage) => number) =>
    usages.reduce((total, usage) => total + read(usage), 0);
  const cacheRead = sum((usage) => usage.cacheRead ?? 0);
  const input = sum(
    (usage) => usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0),
  );
  return [
    {
      name: 'tokens',
      value: sum(uncachedTokens),
      unit: 'tokens',
      better: 'lower',
      builtIn: true,
    },
    {
      name: 'cached tokens',
      value: cacheRead,
      unit: 'tokens',
      builtIn: true,
    },
    {
      name: 'output tokens',
      value: sum((usage) => usage.output),
      unit: 'tokens',
      better: 'lower',
      builtIn: true,
    },
    ...(input > 0
      ? [
          {
            name: 'cache hit rate',
            value: cacheRead / input,
            better: 'higher' as const,
            builtIn: true as const,
          },
        ]
      : []),
  ];
}

/**
 * Every usage a transcript reports that ATXF counts toward its total: on
 * assistant messages, compactions and branch summaries, and usage records
 * that are not running totals.
 */
export function reportedUsages(transcript: Transcript): Usage[] {
  const usages: Usage[] = [];
  for (const record of transcript.records) {
    const usage =
      record.type === 'message' && record.role === 'assistant'
        ? record.usage
        : record.type === 'compaction' || record.type === 'branch_summary'
          ? record.usage
          : record.type === 'usage' && !record.cumulative
            ? record.usage
            : undefined;
    if (usage) usages.push(usage);
  }
  return usages;
}
