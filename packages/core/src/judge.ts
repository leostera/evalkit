import type { JsonValue } from './index.js';

/**
 * How a judge must answer, and how EvalKit turns the answer into a score.
 *
 * - `verdict` (the default): a value from 0 to 1 and a reason, as JSON.
 * - `choices`: one of a fixed set of answers, such as A/B/C, each worth a value.
 * - `criteria`: a value from 0 to 1 per criterion; the score is their weighted mean.
 */
export type JudgeAnswer =
  | { kind: 'verdict' }
  | { kind: 'choices'; choices: JudgeChoice[] }
  | { kind: 'criteria'; criteria: JudgeCriterion[] };

/** One answer a `choices` judge can give. Keys are matched case-insensitively. */
export type JudgeChoice = { key: string; label: string; value: number };

/** One thing a `criteria` judge scores. */
export type JudgeCriterion = {
  name: string;
  weight: number;
  description?: string;
};

const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

function unitInterval(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/**
 * A judge that answers with one of these choices, in this order:
 * `choices({ A: ['Accurate and helpful', 1], B: ['Partly right', 0.5], C: ['Wrong', 0] })`.
 */
export function choices(
  options: Record<string, readonly [label: string, value: number]>,
): JudgeAnswer {
  const entries = Object.entries(options);
  if (entries.length < 2)
    throw new Error('choices(...) needs at least two choices');
  const seen = new Set<string>();
  return {
    kind: 'choices',
    choices: entries.map(([key, [label, value]]) => {
      if (!KEY.test(key))
        throw new Error(
          `Choice ${JSON.stringify(key)} must be a short word of letters, digits, "-" or "_"`,
        );
      if (seen.has(key.toUpperCase()))
        throw new Error(`Choice ${key} is listed twice`);
      seen.add(key.toUpperCase());
      if (!label.trim()) throw new Error(`Choice ${key} needs a label`);
      if (!unitInterval(value))
        throw new Error(
          `Choice ${key} must be worth a number from 0 to 1; received ${String(value)}`,
        );
      return { key, label, value };
    }),
  };
}

/**
 * Criteria by name: a number is the weight; `{ weight, description }` also
 * says what the criterion checks. Weights default to 1.
 */
export type CriteriaOptions = Record<
  string,
  number | { weight?: number; description?: string }
>;

/**
 * A judge that scores each criterion from 0 to 1; the score is the weighted
 * mean. A number is the weight; `{ weight, description }` also says what the
 * criterion means. Weights default to 1.
 */
export function criteria(options: CriteriaOptions): JudgeAnswer {
  return { kind: 'criteria', criteria: declaredCriteria(options) };
}

/** Checked criteria declarations, for `criteria()` and `predicate(..., { criteria })`. */
export function declaredCriteria(options: CriteriaOptions): JudgeCriterion[] {
  const entries = Object.entries(options);
  if (!entries.length) throw new Error('criteria(...) needs a criterion');
  return entries.map(([name, option]) => {
    if (!name.trim()) throw new Error('A criterion needs a name');
    const weight = typeof option === 'number' ? option : (option.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0)
      throw new Error(
        `Criterion ${name} must have a positive weight; received ${String(weight)}`,
      );
    const description =
      typeof option === 'number' ? undefined : option.description;
    return { name, weight, ...(description ? { description } : {}) };
  });
}

/**
 * One criterion's result, as a scorer returns it and as results record it:
 * a value with what it saw, or `reached: false` when the check never got to
 * run, because something before it failed (say, the app would not start).
 * A criterion not reached counts as 0; the score's `explanation` says why,
 * once, instead of every criterion repeating it.
 */
export type CriterionResult = ReachedCriterion | UnreachedCriterion;

export type ReachedCriterion = {
  name: string;
  /** From 0 to 1. */
  value: number;
  /** Default 1, or the declared weight. */
  weight?: number;
  /** Why this value. */
  explanation?: string;
  /** What the check observed, as plain data. */
  evidence?: JsonValue;
};

export type UnreachedCriterion = {
  name: string;
  reached: false;
  weight?: number;
  explanation?: string;
};

/** A criterion as a scorer returns it: its evidence may be any plain value. */
export type CriterionInput =
  | (Omit<ReachedCriterion, 'evidence'> & { evidence?: unknown })
  | UnreachedCriterion;

/** What a criterion counts for in the weighted mean. */
export const criterionValue = (result: CriterionResult): number =>
  'value' in result ? result.value : 0;

/** The weighted mean of criteria; weights default to 1, a criterion not reached counts 0. */
export function weightedMean(results: readonly CriterionResult[]): number {
  let total = 0;
  let weights = 0;
  for (const result of results) {
    const weight = result.weight ?? 1;
    total += weight * criterionValue(result);
    weights += weight;
  }
  if (!weights) throw new Error('Criteria need a positive total weight');
  return total / weights;
}

/** Where a judge runs: at a checkpoint (it sees that turn) or in final scoring (the whole run). */
export type JudgePlacement = 'transcript' | 'scoring';

/** The inputs a judge sees when the rule names none. */
export const DEFAULT_JUDGE_INPUTS = ['conversation', 'reply'] as const;

/** The names of the inputs a judge sees, in prompt order. */
export function judgeInputNames(rule: {
  inputs?: Readonly<Record<string, unknown>>;
}): string[] {
  return rule.inputs ? Object.keys(rule.inputs) : [...DEFAULT_JUDGE_INPUTS];
}

/**
 * The prompt a judge agent receives. `values` holds each input's text;
 * an input without one shows as a `{placeholder}`, which is how the
 * dashboard shows the prompt before any run.
 */
export function judgePrompt(options: {
  rubric: string;
  answer: JudgeAnswer;
  inputs: readonly string[];
  values?: Readonly<Record<string, string>>;
}): string {
  const inputs = options.inputs
    .map((name) => `${name}:\n${options.values?.[name] ?? `{${name}}`}`)
    .join('\n\n');
  return [
    'You are judging one run of an AI agent. Judge only by the rubric, using only the inputs below.',
    `Rubric:\n${options.rubric.trim()}`,
    inputs,
    answerInstruction(options.answer),
  ].join('\n\n');
}

export function answerInstruction(answer: JudgeAnswer): string {
  switch (answer.kind) {
    case 'verdict':
      return 'Answer with only a JSON object: {"value": <a number from 0 to 1>, "explanation": "<one or two sentences why>"}';
    case 'choices':
      return [
        `Answer with one of ${answer.choices.map((choice) => choice.key).join(', ')} on the first line, then one sentence why on the next.`,
        ...answer.choices.map((choice) => `${choice.key}) ${choice.label}`),
      ].join('\n');
    case 'criteria':
      return [
        'Score each criterion from 0 to 1:',
        ...answer.criteria.map(
          (criterion) =>
            `- ${criterion.name}${criterion.description ? `: ${criterion.description}` : ''}`,
        ),
        `Answer with only a JSON object: {"criteria": {${answer.criteria
          .map(
            (criterion) =>
              `${JSON.stringify(criterion.name)}: {"value": <0 to 1>, "explanation": "<why>"}`,
          )
          .join(', ')}}, "explanation": "<one sentence overall>"}`,
      ].join('\n');
  }
}

/** A judge's answer, read: what the score is made of. */
export type JudgeReading = {
  value: number;
  explanation?: string;
  evidence?: JsonValue;
  choice?: string;
  criteria?: CriterionResult[];
};

/** Thrown when a judge's reply is not in the format asked for; the message says why. */
export class UnreadableAnswer extends Error {}

/**
 * Reads a judge's reply in the format its rule asked for. Throws
 * `UnreadableAnswer` with a reason the judge can be told, so it can answer again.
 */
export function readJudgeAnswer(
  answer: JudgeAnswer,
  reply: JsonValue,
): JudgeReading {
  if (answer.kind === 'choices') return readChoice(answer.choices, reply);
  const object = jsonObject(reply);
  if (answer.kind === 'verdict') {
    if (!unitInterval(object.value))
      throw new UnreadableAnswer('"value" must be a number from 0 to 1');
    return {
      value: object.value,
      ...(typeof object.explanation === 'string' && object.explanation.trim()
        ? { explanation: object.explanation.trim() }
        : {}),
      ...(object.evidence !== undefined ? { evidence: object.evidence } : {}),
    };
  }
  const scored = object.criteria;
  if (typeof scored !== 'object' || scored === null || Array.isArray(scored))
    throw new UnreadableAnswer(
      '"criteria" must be an object with one entry per criterion',
    );
  const results = answer.criteria.map((criterion): CriterionResult => {
    const entry = (scored as Record<string, JsonValue>)[criterion.name];
    const value =
      typeof entry === 'number'
        ? entry
        : typeof entry === 'object' && entry !== null && !Array.isArray(entry)
          ? entry.value
          : undefined;
    if (!unitInterval(value))
      throw new UnreadableAnswer(
        `criterion ${JSON.stringify(criterion.name)} needs a "value" from 0 to 1`,
      );
    const explanation =
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof entry.explanation === 'string' &&
      entry.explanation.trim()
        ? entry.explanation.trim()
        : undefined;
    return {
      name: criterion.name,
      value,
      weight: criterion.weight,
      ...(explanation ? { explanation } : {}),
    };
  });
  return {
    value: weightedMean(results),
    criteria: results,
    ...(typeof object.explanation === 'string' && object.explanation.trim()
      ? { explanation: object.explanation.trim() }
      : {}),
  };
}

function readChoice(options: JudgeChoice[], reply: JsonValue): JudgeReading {
  if (typeof reply !== 'string')
    throw new UnreadableAnswer('answer with plain text, not JSON');
  const lines = reply
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] ?? '';
  // Tolerate "B", "B)", "**B**", "Answer: B." and "(B) because…".
  const match =
    /^(?:answer\s*[:-]?\s*)?[*_("'[\s]*([A-Za-z0-9][A-Za-z0-9_-]*)/i.exec(
      first,
    );
  const said = match?.[1]?.toUpperCase();
  const choice = options.find((option) => option.key.toUpperCase() === said);
  if (!choice)
    throw new UnreadableAnswer(
      `the first line must be one of ${options.map((option) => option.key).join(', ')}`,
    );
  const rest = first
    .slice(match![0].length)
    .replace(/^[*_)"'\].:\s-]+/, '')
    .trim();
  const explanation = [rest, ...lines.slice(1)].filter(Boolean).join(' ');
  return {
    value: choice.value,
    choice: choice.key,
    ...(explanation ? { explanation } : {}),
  };
}

/** The JSON object in a reply: the reply itself, or the first `{…}` in its text (code fences allowed). */
function jsonObject(reply: JsonValue): Record<string, JsonValue> {
  if (typeof reply === 'object' && reply !== null && !Array.isArray(reply))
    return reply;
  if (typeof reply !== 'string')
    throw new UnreadableAnswer('answer with a JSON object');
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end < start)
    throw new UnreadableAnswer('answer with only a JSON object');
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new UnreadableAnswer('the JSON object could not be parsed');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new UnreadableAnswer('answer with a JSON object');
  return parsed as Record<string, JsonValue>;
}

/**
 * The pass mark in words: `only 1`, `≥ 0.5`, or for choices the ones that
 * pass, such as `A or B`.
 */
export function passMark(
  passAt: number | undefined,
  answer?: JudgeAnswer,
): string {
  const at = passAt ?? 1;
  if (answer?.kind === 'choices') {
    const passing = answer.choices
      .filter((choice) => choice.value >= at)
      .map((choice) => choice.key);
    if (!passing.length) return 'no choice passes';
    if (passing.length === answer.choices.length) return 'any choice';
    return passing.length === 1
      ? `only ${passing[0]}`
      : `${passing.slice(0, -1).join(', ')} or ${passing.at(-1)}`;
  }
  return at === 1 ? 'only 1' : `≥ ${at}`;
}
