import type {
  CatalogAgent,
  CatalogDataset,
  CatalogEval,
  CatalogScorer,
  RunSummary,
} from '../api.js';
import { agentKey } from './agentName.js';

/**
 * The library groups the catalog's per-scenario definitions into the things
 * authors define once and reuse: agents, judges and datasets.
 */
export type LibraryAgent = {
  key: string;
  agent: CatalogAgent;
  scenarios: CatalogEval[];
  /** Judges in these scenarios use it. */
  judging: CatalogEval[];
};

export function libraryAgents(catalog: readonly CatalogEval[]): LibraryAgent[] {
  const byKey = new Map<string, LibraryAgent>();
  const entry = (agent: CatalogAgent) => {
    const key = agentKey({ agent } as CatalogEval);
    const found = byKey.get(key) ?? { key, agent, scenarios: [], judging: [] };
    byKey.set(key, found);
    return found;
  };
  for (const scenario of catalog) {
    entry(scenario.agent).scenarios.push(scenario);
    const judges = new Map<string, CatalogAgent>();
    for (const scorer of scenarioScorers(scenario))
      if (scorer.agent)
        judges.set(
          agentKey({ agent: scorer.agent } as CatalogEval),
          scorer.agent,
        );
    for (const judge of judges.values()) entry(judge).judging.push(scenario);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** A checkpoint's definition: the transcript step it ran at, when it is still that rule. */
export function checkpointScorer(
  scenario: CatalogEval | undefined,
  step: number,
  name: string,
): CatalogScorer | undefined {
  const entry = scenario?.transcript?.[step];
  return entry?.kind === 'checkpoint' && entry.scorer.name === name
    ? entry.scorer
    : undefined;
}

export type JudgeUse = {
  scenario: CatalogEval;
  /** `final` scores the finished run; `checkpoint` is checked mid-conversation. */
  placement: 'final' | 'checkpoint';
  step?: number;
};

export type LibraryJudge = {
  key: string;
  scorer: CatalogScorer;
  uses: JudgeUse[];
};

/**
 * Predicates and LLM judges. One entry per definition: the same name defined
 * in two places is two judges, told apart by where they are defined.
 */
export function libraryJudges(catalog: readonly CatalogEval[]): LibraryJudge[] {
  const byIdentity = new Map<string, LibraryJudge>();
  const add = (scorer: CatalogScorer, use: JudgeUse) => {
    // A factory (`correctness('purge')`) makes one rule per call, and tail
    // calls hide its file from the stack: rules that check the same thing
    // under the same name are one judge.
    const checks =
      scorer.rubric ?? scorer.description ?? scorer.definedAt ?? '';
    const identity = `${scorer.kind}\0${scorer.name}\0${checks}`;
    const found = byIdentity.get(identity) ?? { key: '', scorer, uses: [] };
    found.uses.push(use);
    byIdentity.set(identity, found);
  };
  for (const scenario of catalog) {
    for (const scorer of scenario.scorers)
      add(scorer, { scenario, placement: 'final' });
    for (const [step, entry] of (scenario.transcript ?? []).entries())
      if (entry.kind === 'checkpoint')
        add(entry.scorer, { scenario, placement: 'checkpoint', step });
  }
  const judges = [...byIdentity.values()];
  const named = new Map<string, number>();
  for (const judge of judges)
    named.set(judge.scorer.name, (named.get(judge.scorer.name) ?? 0) + 1);
  for (const judge of judges)
    judge.key =
      named.get(judge.scorer.name) === 1
        ? judge.scorer.name
        : `${judge.scorer.name}@${judge.scorer.definedAt ?? judge.scorer.kind}`;
  return judges.sort((a, b) => a.key.localeCompare(b.key));
}

/** Every scorer of a scenario: its checkpoints, then its final scorers. */
export function scenarioScorers(scenario: CatalogEval): CatalogScorer[] {
  return [
    ...(scenario.transcript ?? []).flatMap((entry) =>
      entry.kind === 'checkpoint' ? [entry.scorer] : [],
    ),
    ...scenario.scorers,
  ];
}

/** A judge's verdicts in the newest finished runs, newest first. */
export function recentVerdicts(
  runs: readonly RunSummary[],
  uses: readonly JudgeUse[],
  name: string,
  limit = 10,
) {
  const scenarios = new Set(
    uses
      .filter((use) => use.placement === 'final')
      .map((use) => use.scenario.id),
  );
  return runs
    .filter((run) => run.status !== 'running' && scenarios.has(run.evalId))
    .flatMap((run) => {
      const scorer = run.scorers?.find((entry) => entry.name === name);
      return scorer ? [{ run, scorer }] : [];
    })
    .sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt))
    .slice(0, limit);
}

/** How a scorer did in the newest finished runs that recorded it. */
export function scorerResults(
  runs: readonly RunSummary[],
  name: string,
  limit = 10,
): { passed: number; total: number } {
  const recorded = [...runs]
    .filter((run) => run.status !== 'running')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((run) => {
      const scorer = run.scorers?.find((entry) => entry.name === name);
      return scorer && !scorer.skipped && scorer.passed !== undefined
        ? [scorer]
        : [];
    })
    .slice(0, limit);
  return {
    passed: recorded.filter((scorer) => scorer.passed).length,
    total: recorded.length,
  };
}

export type LibraryDataset = {
  dataset: CatalogDataset;
  scenarios: CatalogEval[];
};

export function libraryDatasets(
  catalog: readonly CatalogEval[],
): LibraryDataset[] {
  const byId = new Map<string, LibraryDataset>();
  for (const scenario of catalog)
    for (const dataset of scenario.datasets ?? []) {
      const found = byId.get(dataset.id) ?? { dataset, scenarios: [] };
      found.scenarios.push(scenario);
      byId.set(dataset.id, found);
    }
  return [...byId.values()].sort((a, b) =>
    a.dataset.id.localeCompare(b.dataset.id),
  );
}

/** The newest run of each scenario, for "used by" tables. */
export function latestRunByScenario(
  runs: readonly RunSummary[],
): Map<string, RunSummary> {
  const latest = new Map<string, RunSummary>();
  for (const run of runs) {
    const previous = latest.get(run.evalId);
    if (!previous || previous.startedAt < run.startedAt)
      latest.set(run.evalId, run);
  }
  return latest;
}
