/** What a run may use before EvalKit stops it. */
export type Limits = {
  /** Assistant messages, one per model call, sub-agents included. */
  steps?: number;
  /** The `tokens` metric: uncached input, cache writes and output. Cache reads do not count. */
  tokens?: number;
  /** Milliseconds from the session's start to the end of its last turn; scoring is not counted. */
  time?: number;
};

export type LimitKind = keyof Limits;

export const LIMIT_KINDS: readonly LimitKind[] = ['steps', 'tokens', 'time'];

/** Limits as written in config and scenarios: `time` may be a duration such as `'20m'`. */
export type LimitsInput = {
  steps?: number;
  tokens?: number;
  /** Milliseconds, or `'90s'`, `'20m'`, `'1h'`. */
  time?: number | string;
};

/** Which limit a run hit, its value, and how much was used. */
export type LimitReached = { limit: LimitKind; value: number; used: number };

const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

/** `'20m'` → 1_200_000. A number is milliseconds. */
export function parseDuration(value: number | string, owner: string): number {
  if (typeof value === 'number') return positive(value, owner);
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)\s*$/.exec(value);
  if (!match)
    throw new Error(
      `${owner} must be milliseconds or a duration such as 90s, 20m or 1h; received ${JSON.stringify(value)}`,
    );
  return positive(Number(match[1]) * UNITS[match[2]!]!, owner);
}

function positive(value: number, owner: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${owner} must be a positive number; received ${value}`);
  return value;
}

/** Checks and normalizes limits; `owner` names where they were written. */
export function parseLimits(
  input: LimitsInput | undefined,
  owner: string,
): Limits {
  if (input === undefined) return {};
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`${owner} limits must be an object`);
  const limits: Limits = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'time')
      limits.time = parseDuration(value, `${owner} limits.time`);
    else if (key === 'steps' || key === 'tokens') {
      if (!Number.isInteger(value) || (value as number) <= 0)
        throw new Error(
          `${owner} limits.${key} must be a positive whole number; received ${String(value)}`,
        );
      limits[key] = value as number;
    } else
      throw new Error(
        `${owner} has an unknown limit ${JSON.stringify(key)}; limits are steps, tokens and time`,
      );
  }
  return limits;
}

/** Later layers win, kind by kind: config, then scenario, then matrix cell, then the command line. */
export function resolveLimits(...layers: readonly Limits[]): Limits {
  return Object.assign({}, ...layers) as Limits;
}

/** A matrix's `limits` axes are parameters named `limits.<kind>`. */
export const LIMIT_PARAMETER_PREFIX = 'limits.';

/** The limits a matrix cell's `limits.<kind>` parameters set. */
export function limitsFromParameters(
  parameters: Readonly<Record<string, unknown>> | undefined,
): Limits {
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters ?? {}))
    if (key.startsWith(LIMIT_PARAMETER_PREFIX))
      input[key.slice(LIMIT_PARAMETER_PREFIX.length)] = value;
  return parseLimits(input as LimitsInput, 'The matrix cell');
}

/** `steps=80` or `time=1h`, from `--limit`. */
export function parseLimitFlag(flag: string): Limits {
  const index = flag.indexOf('=');
  if (index < 1)
    throw new Error(
      `--limit takes kind=value, such as steps=80 or time=20m; received ${JSON.stringify(flag)}`,
    );
  const kind = flag.slice(0, index).trim();
  const raw = flag.slice(index + 1).trim();
  return parseLimits(
    { [kind]: kind === 'time' && !/^\d+$/.test(raw) ? raw : Number(raw) },
    '--limit',
  );
}

/** `40 steps`, `2,000,000 tokens`, `20m`. */
export function formatLimit(kind: LimitKind, value: number): string {
  if (kind === 'time') {
    if (value % 3_600_000 === 0) return `${value / 3_600_000}h`;
    if (value % 60_000 === 0) return `${value / 60_000}m`;
    if (value % 1000 === 0) return `${value / 1000}s`;
    return `${value}ms`;
  }
  return `${value.toLocaleString('en-US')} ${kind}`;
}
