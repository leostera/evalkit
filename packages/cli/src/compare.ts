import { canonicalParameters, type JsonObject } from '@evalkit/core';
import type { LocalRun, RunScorer } from './dashboard-reports.js';

/** The fields of a run that comparison reads, locally or from a share server. */
export type ComparedRun = Pick<
  LocalRun,
  'id' | 'evalId' | 'status' | 'startedAt'
> & {
  suiteId?: string;
  parameters?: JsonObject;
  scorers?: RunScorer[];
  datasets?: { id: string; digests: string[] }[];
};

export type UnitChange =
  'regressed' | 'fixed' | 'new' | 'removed' | 'unchanged' | 'not-comparable';

export type ComparedUnit = {
  /** `suite/eval`, plus parameters when the unit is a matrix cell. */
  label: string;
  evalId: string;
  suite: string;
  parameters: JsonObject;
  change: UnitChange;
  /** Why the unit cannot be compared. */
  reason?: string;
  base?: ComparedRun;
  head?: ComparedRun;
};

export type ScorerChange = {
  name: string;
  kind: RunScorer['kind'];
  base?: number;
  head?: number;
  /** Present only on one side; listed, never compared. */
  onlyOn?: 'base' | 'head';
};

export type SuiteComparison = {
  suite: string;
  base: { passed: number; total: number };
  head: { passed: number; total: number };
  scorers: ScorerChange[];
};

export type Comparison = {
  units: ComparedUnit[];
  suites: SuiteComparison[];
  /** Datasets whose content differs between the matched runs. */
  changedDatasets: string[];
  /** Older runs of a unit that were not used because a later one exists. */
  ignoredRuns: { base: number; head: number };
  counts: Record<UnitChange, number>;
};

const FINISHED = new Set<LocalRun['status']>(['passed', 'failed', 'errored']);

function unitKey(run: ComparedRun): string {
  return `${run.evalId}\0${canonicalParameters(run.parameters ?? {})}`;
}

/** The run that represents each unit: the latest finished one, else the latest at all. */
function latestByUnit(runs: readonly ComparedRun[]) {
  const byUnit = new Map<string, ComparedRun>();
  let ignored = 0;
  const ordered = [...runs].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  for (const run of ordered) {
    if (run.status === 'running') continue;
    const key = unitKey(run);
    const current = byUnit.get(key);
    if (!current) byUnit.set(key, run);
    else {
      ignored += 1;
      if (!FINISHED.has(current.status) && FINISHED.has(run.status))
        byUnit.set(key, run);
    }
  }
  return { byUnit, ignored };
}

function scorerSignature(run: ComparedRun): string {
  return (run.scorers ?? [])
    .map((scorer) => `${scorer.kind}:${scorer.name}`)
    .sort()
    .join('\n');
}

function classify(
  base: ComparedRun | undefined,
  head: ComparedRun | undefined,
): { change: UnitChange; reason?: string } {
  if (!base) return { change: 'new' };
  if (!head) return { change: 'removed' };
  for (const [side, run] of [
    ['base', base],
    ['head', head],
  ] as const)
    if (!FINISHED.has(run.status) || run.status === 'errored')
      return { change: 'not-comparable', reason: `${run.status} on ${side}` };
  if (scorerSignature(base) !== scorerSignature(head))
    return { change: 'not-comparable', reason: 'different scorers' };
  if (base.status === 'passed' && head.status === 'failed')
    return { change: 'regressed' };
  if (base.status === 'failed' && head.status === 'passed')
    return { change: 'fixed' };
  return { change: 'unchanged' };
}

function label(run: ComparedRun, suite: string): string {
  const parameters = Object.entries(run.parameters ?? {})
    .map(
      ([key, value]) =>
        `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
    )
    .join(' ');
  const name = suite === 'default' ? run.evalId : `${suite}/${run.evalId}`;
  return parameters ? `${name} [${parameters}]` : name;
}

function mean(values: readonly number[]): number | undefined {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

function suiteScorers(units: readonly ComparedUnit[]): ScorerChange[] {
  const sides = {
    base: new Map<string, number[]>(),
    head: new Map<string, number[]>(),
  };
  const kinds = new Map<string, ScorerChange>();
  for (const unit of units) {
    // Scores are compared only across units that match on both sides.
    if (unit.change === 'not-comparable' || !unit.base || !unit.head) continue;
    for (const side of ['base', 'head'] as const)
      for (const scorer of unit[side]!.scorers ?? []) {
        const key = `${scorer.kind}\0${scorer.name}`;
        kinds.set(key, { name: scorer.name, kind: scorer.kind });
        if (scorer.mean === undefined) continue;
        sides[side].set(key, [...(sides[side].get(key) ?? []), scorer.mean]);
      }
  }
  for (const unit of units) {
    // A scorer only one side has is listed, so a rename is visible.
    if (!unit.base || !unit.head) continue;
    const names = (run: ComparedRun) =>
      new Set((run.scorers ?? []).map((s) => `${s.kind}\0${s.name}`));
    const baseNames = names(unit.base);
    const headNames = names(unit.head);
    for (const scorer of unit.base.scorers ?? [])
      if (!headNames.has(`${scorer.kind}\0${scorer.name}`))
        kinds.set(`${scorer.kind}\0${scorer.name}`, {
          name: scorer.name,
          kind: scorer.kind,
          onlyOn: 'base',
        });
    for (const scorer of unit.head.scorers ?? [])
      if (!baseNames.has(`${scorer.kind}\0${scorer.name}`))
        kinds.set(`${scorer.kind}\0${scorer.name}`, {
          name: scorer.name,
          kind: scorer.kind,
          onlyOn: 'head',
        });
  }
  return [...kinds]
    .map(([key, scorer]) => {
      const base = mean(sides.base.get(key) ?? []);
      const head = mean(sides.head.get(key) ?? []);
      return {
        ...scorer,
        ...(base === undefined || scorer.onlyOn ? {} : { base }),
        ...(head === undefined || scorer.onlyOn ? {} : { head }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Matches base and head runs by eval ID and parameters and classifies each
 * unit. It reads recorded verdicts and means; it never re-scores.
 */
export function compareRuns(
  baseRuns: readonly ComparedRun[],
  headRuns: readonly ComparedRun[],
): Comparison {
  const base = latestByUnit(baseRuns);
  const head = latestByUnit(headRuns);
  const keys = [...new Set([...base.byUnit.keys(), ...head.byUnit.keys()])];
  const units = keys
    .map((key): ComparedUnit => {
      const baseRun = base.byUnit.get(key);
      const headRun = head.byUnit.get(key);
      const run = (headRun ?? baseRun)!;
      const suite = headRun?.suiteId ?? baseRun?.suiteId ?? 'default';
      return {
        label: label(run, suite),
        evalId: run.evalId,
        suite,
        parameters: run.parameters ?? {},
        ...classify(baseRun, headRun),
        ...(baseRun ? { base: baseRun } : {}),
        ...(headRun ? { head: headRun } : {}),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const changedDatasets = new Set<string>();
  for (const unit of units) {
    if (!unit.base || !unit.head) continue;
    const digests = (run: ComparedRun) =>
      new Map((run.datasets ?? []).map((d) => [d.id, d.digests.join(',')]));
    const before = digests(unit.base);
    const after = digests(unit.head);
    for (const id of new Set([...before.keys(), ...after.keys()]))
      if (before.get(id) !== after.get(id)) changedDatasets.add(id);
  }

  const bySuite = new Map<string, ComparedUnit[]>();
  for (const unit of units)
    bySuite.set(unit.suite, [...(bySuite.get(unit.suite) ?? []), unit]);
  const suites = [...bySuite]
    .map(([suite, members]) => {
      const side = (pick: 'base' | 'head') => {
        const runs = members.flatMap((unit) =>
          unit[pick] ? [unit[pick]!] : [],
        );
        return {
          passed: runs.filter((run) => run.status === 'passed').length,
          total: runs.length,
        };
      };
      return {
        suite,
        base: side('base'),
        head: side('head'),
        scorers: suiteScorers(members),
      };
    })
    .sort((a, b) => a.suite.localeCompare(b.suite));

  const counts: Record<UnitChange, number> = {
    regressed: 0,
    fixed: 0,
    new: 0,
    removed: 0,
    unchanged: 0,
    'not-comparable': 0,
  };
  for (const unit of units) counts[unit.change] += 1;
  return {
    units,
    suites,
    changedDatasets: [...changedDatasets].sort(),
    ignoredRuns: { base: base.ignored, head: head.ignored },
    counts,
  };
}

/** `--fail-on` conditions; several may be given. */
export type FailCondition =
  { kind: 'regression' } | { kind: 'score-drop'; threshold: number };

export function parseFailOn(values: readonly string[]): FailCondition[] {
  return values
    .flatMap((value) => value.split(','))
    .map((value): FailCondition => {
      if (value === 'regression') return { kind: 'regression' };
      const drop = /^score-drop=(\d*\.?\d+)$/.exec(value);
      if (drop) {
        const threshold = Number(drop[1]);
        if (threshold >= 0 && threshold <= 1)
          return { kind: 'score-drop', threshold };
      }
      throw new Error(
        `Unknown --fail-on ${JSON.stringify(value)}; use regression or score-drop=0.05`,
      );
    });
}

/** Human-readable reasons the comparison fails the given conditions; empty when it passes. */
export function gateFailures(
  comparison: Comparison,
  conditions: readonly FailCondition[],
): string[] {
  const failures: string[] = [];
  for (const condition of conditions) {
    if (condition.kind === 'regression' && comparison.counts.regressed)
      failures.push(
        `${comparison.counts.regressed} regressed: ${comparison.units
          .filter((unit) => unit.change === 'regressed')
          .map((unit) => unit.label)
          .join(', ')}`,
      );
    if (condition.kind === 'score-drop')
      for (const suite of comparison.suites)
        for (const scorer of suite.scorers)
          if (
            scorer.base !== undefined &&
            scorer.head !== undefined &&
            scorer.base - scorer.head > condition.threshold
          )
            failures.push(
              `${suite.suite} ${scorer.name} dropped ${scorer.base.toFixed(2)} → ${scorer.head.toFixed(2)} (more than ${condition.threshold})`,
            );
  }
  return failures;
}

const fixed2 = (value: number | undefined) =>
  value === undefined ? '–' : value.toFixed(2);

function scorerText(scorer: ScorerChange): string {
  if (scorer.onlyOn) return `${scorer.name} only on ${scorer.onlyOn}`;
  return `${scorer.name} ${fixed2(scorer.base)} → ${fixed2(scorer.head)}`;
}

/** A merge request comment. */
export function comparisonMarkdown(
  comparison: Comparison,
  heading: { base: string; head: string },
): string {
  const { counts } = comparison;
  const list = (change: UnitChange) =>
    comparison.units
      .filter((unit) => unit.change === change)
      .map(
        (unit) =>
          `- \`${unit.label}\`${unit.reason ? ` (${unit.reason})` : ''}`,
      );
  const lines = [
    `### EvalKit: ${heading.base} → ${heading.head}`,
    '',
    `**${counts.regressed} regressed** · ${counts.fixed} fixed · ${counts.new} new · ${counts.removed} removed · ${counts.unchanged} unchanged${counts['not-comparable'] ? ` · ${counts['not-comparable']} not comparable` : ''}`,
    '',
  ];
  for (const [title, change] of [
    ['Regressed', 'regressed'],
    ['Fixed', 'fixed'],
    ['New', 'new'],
    ['Removed', 'removed'],
    ['Not comparable', 'not-comparable'],
  ] as const) {
    const items = list(change);
    if (items.length) lines.push(`**${title}**`, '', ...items, '');
  }
  lines.push('| Suite | Passed | Scores |', '| --- | --- | --- |');
  for (const suite of comparison.suites)
    lines.push(
      `| ${suite.suite} | ${suite.base.passed}/${suite.base.total} → ${suite.head.passed}/${suite.head.total} | ${suite.scorers.map(scorerText).join('<br>') || '–'} |`,
    );
  if (comparison.changedDatasets.length)
    lines.push(
      '',
      `Datasets changed: ${comparison.changedDatasets.map((id) => `\`${id}\``).join(', ')}`,
    );
  return `${lines.join('\n')}\n`;
}

export function comparisonLines(comparison: Comparison): {
  units: { change: UnitChange; labels: string[] }[];
  counts: string;
  suites: string[];
  datasets?: string;
} {
  const { counts } = comparison;
  const labels = (change: UnitChange) =>
    comparison.units
      .filter((unit) => unit.change === change)
      .map((unit) =>
        unit.reason ? `${unit.label} (${unit.reason})` : unit.label,
      );
  return {
    units: (['regressed', 'fixed', 'not-comparable'] as const)
      .map((change) => ({ change, labels: labels(change) }))
      .filter((entry) => entry.labels.length),
    counts: `+ ${counts.new} new   − ${counts.removed} removed   ${counts.unchanged} unchanged`,
    suites: comparison.suites.map(
      (suite) =>
        `${suite.suite.padEnd(12)} ${suite.base.passed}/${suite.base.total} → ${suite.head.passed}/${suite.head.total}   ${suite.scorers.map(scorerText).join(' · ')}`,
    ),
    ...(comparison.changedDatasets.length
      ? {
          datasets: `datasets    ${comparison.changedDatasets.join(', ')} changed`,
        }
      : {}),
  };
}
