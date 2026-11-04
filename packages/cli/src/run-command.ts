import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import {
  authoringId,
  defineEvalMatrix,
  passMark,
  type EvalCatalogEntry,
  type JsonObject,
  type JsonValue,
  type EvalRegistry,
  type MatrixSelection,
} from '@evalkit/core';
import { localReportStore, runMatrix } from '@evalkit/runner';
import {
  banner,
  bold,
  cyan,
  dim,
  interactive,
  plural,
  runnerLogs,
  yellow,
} from './terminal.js';
import { detectSource, runCatalog, shortSource } from './source.js';
import {
  loadProject,
  SANDBOX_INSIDE_WARNING,
  sandboxLocation,
  type LoadError,
} from './project.js';
import { createRunReporter, runReport, totalsLine } from './run-reporter.js';
import { junitReport } from './junit.js';
import { detectPackageManager, evalkitCommand } from './package-manager.js';
import { VERSION } from './version.js';

/** Validates `run` flags into a selection, parameter overrides and limits. */
export function normalizeRunOptions(
  values: {
    config?: string;
    eval?: string[];
    suite?: string;
    matrix?: string;
    model?: string[];
    mode?: string[];
    select?: string[];
    param?: string[];
    'max-tokens'?: string;
    'chat-timeout-ms'?: string;
    'turn-budget'?: string;
    concurrency?: string;
    repeat?: string;
    json?: boolean;
    'dry-run'?: boolean;
    all?: boolean;
    local?: boolean;
    junit?: string;
    verbose?: boolean;
    'skip-broken'?: boolean;
  },
  positionals: string[],
) {
  const parameters: JsonObject = {};
  function integer(name: keyof typeof values): number | undefined {
    const value = values[name];
    if (value === undefined) return undefined;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1)
      throw new Error(`--${name} must be a positive integer`);
    return number;
  }
  for (const [flag, key] of [
    ['max-tokens', 'maxTokens'],
    ['chat-timeout-ms', 'chatTimeoutMs'],
    ['turn-budget', 'turnBudget'],
  ] as const) {
    const value = integer(flag);
    if (value !== undefined) parameters[key] = value;
  }
  const selection: Record<string, JsonValue[]> = {};
  for (const key of ['model', 'mode'] as const) {
    if (values[key]?.length)
      selection[key] = values[key].flatMap((value) => value.split(','));
  }
  for (const value of values.select ?? []) {
    const index = value.indexOf('=');
    if (index < 1) throw new Error('--select requires axis=value');
    const axis = value.slice(0, index);
    const raw = value.slice(index + 1);
    let choices: JsonValue[];
    try {
      // JSON values select themselves: `n=3`, `flag=true`, `name="a,b"`.
      choices = [JSON.parse(raw)];
    } catch {
      // Anything else is text, and commas list several values.
      choices = raw.split(',').filter(Boolean);
    }
    (selection[axis] ??= []).push(...choices);
  }
  for (const value of values.param ?? []) {
    const index = value.indexOf('=');
    if (index < 1) throw new Error('--param requires name=JSON');
    parameters[value.slice(0, index)] = JSON.parse(value.slice(index + 1));
  }
  return {
    values,
    positionals,
    parameters,
    selection,
    concurrency: integer('concurrency'),
    repeat: integer('repeat'),
  };
}

/** Load errors that affect what was asked for, so the run must not pretend it covered them. */
function brokenSelection(
  loadErrors: LoadError[],
  request: { suiteId?: string; evalIds: string[]; registry: EvalRegistry },
): LoadError[] {
  if (!loadErrors.length) return [];
  if (request.suiteId)
    return loadErrors.filter((error) => error.suiteId === request.suiteId);
  if (request.evalIds.length)
    // An eval that is not registered may be defined by a file that failed.
    return request.evalIds.some((id) => !request.registry.get(id))
      ? loadErrors
      : [];
  return loadErrors;
}

/** Load errors are warnings; `print` is stderr when stdout must stay machine-readable. */
export function printLoadErrors(
  loadErrors: readonly LoadError[],
  print: (line: string) => void = console.log,
): void {
  for (const { file, error } of loadErrors)
    print(
      `  ${yellow('✗')} ${bold(file)} failed to load:\n    ${dim(error.message)}`,
    );
  if (loadErrors.length) print('');
}

export type RunInput = ReturnType<typeof normalizeRunOptions>;

export async function runProjectCommand(
  cwd: string,
  parsed: RunInput,
): Promise<void> {
  const { values, positionals, parameters } = parsed;
  const started = performance.now();
  const project = await loadProject(cwd, values.config);
  // Dataset paths are relative to the config project, even when invoked elsewhere.
  process.chdir(project.root);
  const registry = project.registry;
  // Eval IDs from --eval and positional arguments mean the same thing.
  const requestedEvals = [...(values.eval ?? []), ...positionals].flatMap(
    (value) => value.split(',').filter(Boolean),
  );
  let matrix;
  let suiteId: string | undefined;
  // JSON and dry-run output stay machine-readable on stdout.
  const quiet = Boolean(values.json || values['dry-run']);
  if (!quiet) banner('run', VERSION);
  const suite = values.suite
    ? registry.suites.find((item) => item.id === values.suite)
    : undefined;
  if (values.suite) {
    const broken = project.loadErrors.filter(
      (error) => error.suiteId === values.suite,
    );
    if (!suite && !broken.length)
      throw new Error(`Unknown suite: ${values.suite}`);
    suiteId = values.suite;
  }
  // The named matrix, else the config's; a plain list of scenarios without one.
  const configured = values.matrix
    ? registry.matrices.find((item) => item.id === values.matrix)
    : project.config.matrix
      ? registry.matrices.at(-1)
      : undefined;
  if (values.matrix && !configured)
    throw new Error(`Unknown matrix: ${values.matrix}`);
  if (configured && suite) {
    // A suite narrows the matrix to the scenarios in both.
    const inSuite = new Set(suite.evals.map(authoringId));
    const both = configured.evals
      .map(authoringId)
      .filter((id) => inSuite.has(id));
    if (!both.length)
      throw new Error(
        `Matrix ${authoringId(configured)} has no scenarios from suite ${suite.id}`,
      );
    const outside = requestedEvals.filter((id) => !both.includes(id));
    if (outside.length)
      throw new Error(
        `Not in both matrix ${authoringId(configured)} and suite ${suite.id}: ${outside.join(', ')}`,
      );
    if (!requestedEvals.length) requestedEvals.push(...both);
  }
  matrix =
    configured ??
    defineEvalMatrix({
      id: 'default',
      // A suite whose files all failed to load has no evals; that is reported below.
      evals: values.suite ? (suite?.evals ?? []) : registry.evals,
      parameters: {},
    });
  const broken = brokenSelection(project.loadErrors, {
    ...(suiteId ? { suiteId } : {}),
    evalIds: requestedEvals,
    registry,
  });
  printLoadErrors(project.loadErrors, quiet ? console.error : console.log);
  if (broken.length && !values['skip-broken'] && !values['dry-run'])
    throw new Error(
      `${plural(broken.length, 'eval file')} in this selection failed to load: ${broken.map((error) => error.file).join(', ')}. Fix ${broken.length === 1 ? 'it' : 'them'}, or pass --skip-broken to run the rest.`,
    );
  const knownEvals = requestedEvals.filter((id) => registry.get(id));
  if (values['skip-broken'] && knownEvals.length < requestedEvals.length) {
    requestedEvals.length = 0;
    requestedEvals.push(...knownEvals);
    if (!requestedEvals.length)
      throw new Error('Every selected eval is in a file that failed to load.');
  }
  const selection: MatrixSelection = {
    parameters: {},
    overrides: { ...parameters },
    ...(requestedEvals.length ? { evals: requestedEvals } : {}),
  };
  for (const [axis, choices] of Object.entries(parsed.selection)) {
    if (
      axis in matrix.parameters ||
      matrix.cases?.some((assignment) => Object.hasOwn(assignment, axis))
    )
      (selection.parameters as Record<string, JsonValue[]>)[axis] = choices;
    else if (
      (axis === 'model' || axis === 'mode') &&
      choices.length === 1 &&
      !project.config.matrix &&
      !values.matrix
    )
      selection.overrides![axis] = choices[0]!;
    else throw new Error(`Unknown matrix axis: ${axis}`);
  }
  const cells = matrix.count(selection);
  if (!cells)
    throw new Error(
      'Selection contains no eligible cells; check cases and exclusions',
    );
  const repeat = parsed.repeat ?? project.config.execution?.repeat;
  // Each cell starts its scenario's `repeat` runs unless --repeat overrides it.
  let runs = 0;
  for (const cell of matrix.cells(selection))
    runs += repeat ?? cell.eval.repeat ?? 1;
  const plan = {
    matrix: authoringId(matrix),
    // The scenarios that will run: the requested ones, or all of the matrix's.
    evals: requestedEvals.length
      ? requestedEvals
      : matrix.evals.map((definition) => definition.id),
    cells,
    runs,
    parameters: selection.parameters,
    overrides: selection.overrides,
    repeat: repeat ?? 'scenario',
    // What each scenario checks, before anything runs.
    scoring: Object.fromEntries(
      registry
        .catalog({ root: project.root })
        .filter((entry) =>
          matrix.evals.some((definition) => definition.id === entry.id),
        )
        .map((entry) => [entry.id, plannedChecks(entry)]),
    ),
  };
  if (values['dry-run']) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  // The cell limit guards matrix sweeps; a plain list of scenarios is never refused.
  const sweeps =
    Object.keys(matrix.parameters).length > 0 || Boolean(matrix.cases?.length);
  if (
    sweeps &&
    cells > (project.config.execution?.maxCells ?? 100) &&
    !values.all
  )
    throw new Error(
      `Selected ${cells} cells. Narrow the selection, inspect --dry-run, or pass --all.`,
    );
  const reportDir = resolve(
    project.root,
    project.config.reportDir ?? '_evalkit-results',
  );
  const sandbox = sandboxLocation(project);
  const sandboxDir = sandbox.path;
  if (sandbox.inside)
    console.error(`  ${yellow('!')} ${SANDBOX_INSIDE_WARNING}`);
  const source = await detectSource(project.root, {
    outputDirs: [
      reportDir,
      sandboxDir,
      resolve(project.root, '_evalkit-dashboard'),
    ],
  });
  const suiteOf = new Map(
    registry.suites.flatMap((suite) =>
      suite.evals.map(
        (evaluation) => [authoringId(evaluation), suite.id] as const,
      ),
    ),
  );
  const suiteFor = (evalId: string) => suiteId ?? suiteOf.get(evalId);
  if (!values.json)
    console.log(
      `  Running ${runs === cells ? plural(cells, 'scenario') : `${plural(runs, 'run')} of ${plural(cells, 'scenario')}`}${sweeps ? ` from matrix ${plan.matrix}` : ''}${suiteId ? ` from suite ${suiteId}` : ''}` +
        (source
          ? ` at ${shortSource(source)}${source.ref ? ` (${source.ref})` : ''}`
          : ' (untracked: not in a git repository)') +
        '\n',
    );
  const reporter = createRunReporter({
    interactive: interactive && !values.json,
    verbose: Boolean(values.verbose),
    total: runs,
    labelFor: (run) => {
      const suite = suiteFor(run.evalId);
      const label = suite ? `${suite}/${run.evalId}` : run.evalId;
      return run.batch
        ? `${label} #${run.batch.index + 1}/${run.batch.size}`
        : label;
    },
    write: values.json ? () => {} : undefined,
  });
  const controller = new AbortController();
  const onInterrupt = () => {
    if (controller.signal.aborted) {
      // Second Ctrl+C: leave now; readers show the runs as interrupted.
      process.exit(130);
    }
    controller.abort();
    if (!values.json) reporter.cancelling();
  };
  process.on('SIGINT', onInterrupt);
  reporter.start();
  let summary;
  try {
    summary = await Effect.runPromise(
      runnerLogs(
        runMatrix(matrix, {
          selection,
          concurrency:
            parsed.concurrency ?? project.config.execution?.concurrency ?? 4,
          ...(repeat ? { repeat } : {}),
          ...(suiteId ? { suiteId } : {}),
          suiteFor: (cell) => suiteFor(authoringId(cell.eval)),
          ...(values.local ? { runtime: 'local' as const } : {}),
          ...(source ? { source } : {}),
          catalog: runCatalog(registry, project.root),
          report: localReportStore(reportDir),
          workspaceRoot: sandboxDir,
          keepWorkspaces: project.config.keepSandboxes,
          artifactExclude: project.config.artifacts?.exclude,
          attachmentLimits: project.config.artifacts?.attachments,
          judge: project.config.judge,
          signal: controller.signal,
          onEvent: (run, event) => reporter.onEvent(run, event),
          onResult: (cell, results) => {
            for (const result of results) {
              const report = runReport(
                cell,
                result,
                suiteFor(authoringId(cell.eval)),
              );
              if (values.json)
                console.log(
                  JSON.stringify({
                    cell: {
                      key: cell.key,
                      eval: authoringId(cell.eval),
                      parameters: cell.parameters,
                    },
                    outcome: report.outcome,
                    result,
                  }),
                );
              reporter.onRun(report);
            }
          },
        }),
      ),
    );
  } finally {
    process.off('SIGINT', onInterrupt);
  }
  const totals = reporter.finish(performance.now() - started);
  if (values.junit) {
    const file = resolve(cwd, values.junit);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, junitReport(reporter.runs()));
  }
  if (values.json) console.log(JSON.stringify({ summary: totals }));
  else {
    console.log(`\n${totalsLine(totals)}`);
    if (values.junit) console.log(`  ${dim(`JUnit report: ${values.junit}`)}`);
    const manager = detectPackageManager(project.root);
    const hint = (args: string, why: string) =>
      console.log(
        `  ${cyan('➜')} ${evalkitCommand(manager, args).padEnd(24)} ${dim(why)}`,
      );
    hint('dev', 'to inspect');
    if (project.config.share) hint('share', 'to publish');
    console.log('');
  }
  if (controller.signal.aborted) process.exitCode = 130;
  else if (summary.failed || broken.length) process.exitCode = 1;
}

/** A scenario's checkpoints and final scorers, as `--dry-run` lists them. */
function plannedChecks(entry: EvalCatalogEntry) {
  const scorers = [
    ...entry.transcript.flatMap((step, index) =>
      step.kind === 'checkpoint'
        ? [{ scorer: step.scorer, at: `step ${index}` }]
        : [],
    ),
    ...entry.scorers.map((scorer) => ({ scorer, at: 'final' })),
  ];
  return scorers.map(({ scorer, at }) => ({
    name: scorer.name,
    kind: scorer.kind,
    at,
    ...(scorer.description ? { description: scorer.description } : {}),
    passes: passMark(scorer.passAt, scorer.answer),
    ...(scorer.agent
      ? { agent: scorer.agent.name ?? scorer.agent.id ?? scorer.agent.kind }
      : {}),
  }));
}
