import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import {
  authoringId,
  defineEvalMatrix,
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
import { loadProject, type LoadError } from './project.js';
import {
  createRunReporter,
  scenarioResult,
  totalsLine,
} from './run-reporter.js';
import { junitReport } from './junit.js';
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
    trials?: string;
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
    let choice: JsonValue;
    try {
      choice = JSON.parse(value.slice(index + 1));
    } catch {
      choice = value.slice(index + 1);
    }
    (selection[axis] ??= []).push(choice);
  }
  for (const value of values.param ?? []) {
    const index = value.indexOf('=');
    if (index < 1) throw new Error('--param requires name=JSON');
    parameters[value.slice(0, index)] = JSON.parse(value.slice(index + 1));
  }
  if (values.suite && values.matrix)
    throw new Error('--suite and --matrix cannot be used together');
  if ((values.suite || values.matrix) && positionals.length)
    throw new Error('Use --eval to select evals with --suite or --matrix');
  return {
    values,
    positionals,
    parameters,
    selection,
    concurrency: integer('concurrency'),
    trials: integer('trials'),
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
  const requestedEvals =
    values.eval?.flatMap((value) => value.split(',')) ?? [];
  let matrix;
  let suiteId: string | undefined;
  // JSON and dry-run output stay machine-readable on stdout.
  const quiet = Boolean(values.json || values['dry-run']);
  if (!quiet) banner('run', VERSION);
  if (values.suite) {
    const suite = registry.suites.find((item) => item.id === values.suite);
    const broken = project.loadErrors.filter(
      (error) => error.suiteId === values.suite,
    );
    if (!suite && !broken.length)
      throw new Error(`Unknown suite: ${values.suite}`);
    suiteId = values.suite;
    matrix = defineEvalMatrix({
      id: 'default',
      evals: suite?.evals ?? [],
      parameters: project.config.matrix?.parameters ?? {},
      defaults: project.config.matrix?.defaults,
      cases: project.config.matrix?.cases,
      exclude: project.config.matrix?.exclude,
    });
  } else if (values.matrix) {
    matrix = registry.matrices.find((item) => item.id === values.matrix);
    if (!matrix) throw new Error(`Unknown matrix: ${values.matrix}`);
  } else {
    requestedEvals.push(...positionals.flatMap((value) => value.split(',')));
    matrix = project.config.matrix
      ? registry.matrices.at(-1)!
      : defineEvalMatrix({
          id: 'default',
          evals: registry.evals,
          parameters: {},
        });
  }
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
  const trials = parsed.trials ?? project.config.execution?.trials;
  const plan = {
    matrix: authoringId(matrix),
    // The scenarios that will run: the requested ones, or all of the matrix's.
    evals: requestedEvals.length
      ? requestedEvals
      : matrix.evals.map((definition) => definition.id),
    cells,
    parameters: selection.parameters,
    overrides: selection.overrides,
    trials: trials ?? 'eval policy',
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
  const sandboxDir = resolve(
    project.root,
    project.config.sandboxDir ?? '_evalkit-sandbox',
  );
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
      `  Running ${plural(cells, 'scenario')}${sweeps ? ` from matrix ${plan.matrix}` : ''}${suiteId ? ` from suite ${suiteId}` : ''}` +
        (source
          ? ` at ${shortSource(source)}${source.ref ? ` (${source.ref})` : ''}`
          : ' (untracked: not in a git repository)') +
        '\n',
    );
  const reporter = createRunReporter({
    interactive: interactive && !values.json,
    verbose: Boolean(values.verbose),
    total: cells,
    labelFor: (trial) => {
      const suite = suiteFor(trial.evalId);
      return suite ? `${suite}/${trial.evalId}` : trial.evalId;
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
          trials,
          ...(suiteId ? { suiteId } : {}),
          suiteFor: (cell) => suiteFor(authoringId(cell.eval)),
          ...(values.local ? { runtime: 'local' as const } : {}),
          ...(source ? { source } : {}),
          catalog: runCatalog(registry, project.root),
          report: localReportStore(reportDir),
          workspaceRoot: sandboxDir,
          signal: controller.signal,
          onEvent: (trial, event) => reporter.onEvent(trial, event),
          onResult: (cell, result) => {
            const scenario = scenarioResult(
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
                  outcome: scenario.outcome,
                  result,
                }),
              );
            reporter.onScenario(scenario);
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
    await writeFile(file, junitReport(reporter.scenarios()));
  }
  if (values.json) console.log(JSON.stringify({ summary: totals }));
  else {
    console.log(`\n${totalsLine(totals)}`);
    if (values.junit) console.log(`  ${dim(`JUnit report: ${values.junit}`)}`);
    console.log(
      `  ${cyan('➜')} bun run evalkit dev        ${dim('to inspect')}`,
    );
    if (project.config.share)
      console.log(
        `  ${cyan('➜')} bun run evalkit share      ${dim('to publish')}`,
      );
    console.log('');
  }
  if (controller.signal.aborted) process.exitCode = 130;
  else if (summary.failed || broken.length) process.exitCode = 1;
}
