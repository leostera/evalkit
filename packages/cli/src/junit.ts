import type { ScenarioResult } from './run-reporter.js';
import { parameterLabel } from './run-reporter.js';

function escape(text: string): string {
  return (
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // XML 1.0 cannot carry most control characters, even escaped.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

const seconds = (ms: number | undefined) => ((ms ?? 0) / 1000).toFixed(3);

/**
 * A JUnit XML report: one test suite per EvalKit suite (`default` for
 * scenarios without one) and one test case per scenario, per matrix cell
 * when it has parameters.
 */
export function junitReport(scenarios: readonly ScenarioResult[]): string {
  const bySuite = new Map<string, ScenarioResult[]>();
  for (const scenario of scenarios) {
    const suite = scenario.suiteId ?? 'default';
    bySuite.set(suite, [...(bySuite.get(suite) ?? []), scenario]);
  }
  const suites = [...bySuite].map(([suite, cases]) => {
    const failures = cases.filter((c) => c.outcome === 'failed').length;
    const skipped = cases.filter(
      (c) =>
        c.outcome === 'cancelled' ||
        (c.outcome === 'passed' && c.skipped.length > 0 && allSkipped(c)),
    ).length;
    const time = cases.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);
    const testcases = cases.map((scenario) => {
      const parameters = parameterLabel(scenario.parameters);
      const name = parameters
        ? `${scenario.evalId} [${parameters}]`
        : scenario.evalId;
      const attributes = `name="${escape(name)}" classname="${escape(suite)}" time="${seconds(scenario.durationMs)}"`;
      if (scenario.outcome === 'failed') {
        const message = scenario.reasons.join('; ') || 'failed';
        return `    <testcase ${attributes}>\n      <failure message="${escape(message)}">${escape(scenario.reasons.join('\n'))}</failure>\n    </testcase>`;
      }
      if (scenario.outcome === 'cancelled')
        return `    <testcase ${attributes}>\n      <skipped message="cancelled"/>\n    </testcase>`;
      if (allSkipped(scenario))
        return `    <testcase ${attributes}>\n      <skipped message="${escape(`all scorers skipped: ${scenario.skipped.join(', ')}`)}"/>\n    </testcase>`;
      return `    <testcase ${attributes}/>`;
    });
    return `  <testsuite name="${escape(suite)}" tests="${cases.length}" failures="${failures}" errors="0" skipped="${skipped}" time="${seconds(time)}">\n${testcases.join('\n')}\n  </testsuite>`;
  });
  const total = scenarios.length;
  const failures = scenarios.filter((c) => c.outcome === 'failed').length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="evalkit" tests="${total}" failures="${failures}">\n${suites.join('\n')}\n</testsuites>\n`;
}

/** True when every score of every trial was skip()ped. */
function allSkipped(scenario: ScenarioResult): boolean {
  const trials = scenario.result.trials ?? [scenario.result];
  const results = trials.flatMap((trial) => trial.scoring?.results ?? []);
  return results.length > 0 && results.every((score) => score.skipped);
}
