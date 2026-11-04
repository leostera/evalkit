import type { RunReport } from './run-reporter.js';
import { limitReason, parameterLabel } from './run-reporter.js';

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
 * scenarios without one) and one test case per run, named after its scenario
 * and parameters, and its place in a batch (` #2`) when repeated.
 */
export function junitReport(scenarios: readonly RunReport[]): string {
  const bySuite = new Map<string, RunReport[]>();
  for (const scenario of scenarios) {
    const suite = scenario.suiteId ?? 'default';
    bySuite.set(suite, [...(bySuite.get(suite) ?? []), scenario]);
  }
  const suites = [...bySuite].map(([suite, cases]) => {
    const failures = cases.filter(
      (c) => c.outcome === 'failed' || c.outcome === 'limited',
    ).length;
    const skipped = cases.filter(
      (c) =>
        c.outcome === 'cancelled' ||
        (c.outcome === 'passed' && c.skipped.length > 0 && allSkipped(c)),
    ).length;
    const time = cases.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);
    const testcases = cases.map((scenario) => {
      const parameters = parameterLabel(scenario.parameters);
      const batch = scenario.result.batch;
      const name =
        (parameters ? `${scenario.evalId} [${parameters}]` : scenario.evalId) +
        (batch ? ` #${batch.index + 1}` : '');
      const attributes = `name="${escape(name)}" classname="${escape(suite)}" time="${seconds(scenario.durationMs)}"`;
      if (scenario.outcome === 'limited') {
        const reasons = [limitReason(scenario.result), ...scenario.reasons];
        return `    <testcase ${attributes}>\n      <failure message="${escape(reasons.join('; '))}" type="limited">${escape(reasons.join('\n'))}</failure>\n    </testcase>`;
      }
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
  const failures = scenarios.filter(
    (c) => c.outcome === 'failed' || c.outcome === 'limited',
  ).length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="evalkit" tests="${total}" failures="${failures}">\n${suites.join('\n')}\n</testsuites>\n`;
}

/** True when every score was skip()ped. */
function allSkipped(scenario: RunReport): boolean {
  const results = scenario.result.scoring?.results ?? [];
  return results.length > 0 && results.every((score) => score.skipped);
}
