import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import {
  authoringId,
  defineEvalMatrix,
  type JsonObject,
  type JsonValue,
  type MatrixSelection,
} from '@evalkit/core';
import { localReportStore, runMatrix } from '@evalkit/runner';
import { loadProject } from './project.js';

export function parseRunArgs(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      config: { type: 'string' },
      eval: { type: 'string', multiple: true },
      model: { type: 'string', multiple: true },
      mode: { type: 'string', multiple: true },
      select: { type: 'string', multiple: true },
      param: { type: 'string', multiple: true },
      'max-tokens': { type: 'string' },
      'chat-timeout-ms': { type: 'string' },
      'turn-budget': { type: 'string' },
      concurrency: { type: 'string' },
      trials: { type: 'string' },
      json: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      all: { type: 'boolean' },
      local: { type: 'boolean' },
    },
  });
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
    if (values[key])
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
  return {
    values,
    positionals,
    parameters,
    selection,
    concurrency: integer('concurrency'),
    trials: integer('trials'),
  };
}

export async function runProjectCommand(
  command: string,
  args: string[],
  cwd = process.cwd(),
): Promise<void> {
  const parsed = parseRunArgs(args);
  const { values, positionals, parameters } = parsed;
  const project = await loadProject(cwd, values.config);
  // Fixture src paths are relative to the config project, even when invoked elsewhere.
  process.chdir(project.root);
  const registry = project.registry;
  const requestedEvals =
    values.eval?.flatMap((value) => value.split(',')) ?? [];
  let matrix;
  let suiteId: string | undefined;
  if (command === 'run-matrix') {
    if (positionals.length !== 1)
      throw new Error('run-matrix requires one matrix ID');
    matrix = registry.matrices.find((m) => m.id === positionals[0]);
    if (!matrix) throw new Error(`Unknown matrix: ${positionals[0]}`);
  } else if (command === 'run-suite') {
    if (positionals.length !== 1)
      throw new Error('run-suite requires one suite ID');
    const suite = registry.suites.find((s) => s.id === positionals[0]);
    if (!suite) throw new Error(`Unknown suite: ${positionals[0]}`);
    suiteId = authoringId(suite);
    matrix = defineEvalMatrix({
      id: 'default',
      evals: suite.evals,
      parameters: project.config.matrix?.parameters ?? {},
      defaults: project.config.matrix?.defaults,
    });
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
  const selection: MatrixSelection = {
    parameters: {},
    overrides: { ...parameters },
    ...(requestedEvals.length ? { evals: requestedEvals } : {}),
  };
  for (const [axis, choices] of Object.entries(parsed.selection)) {
    if (axis in matrix.parameters)
      (selection.parameters as Record<string, JsonValue[]>)[axis] = choices;
    else if (
      (axis === 'model' || axis === 'mode') &&
      choices.length === 1 &&
      !project.config.matrix &&
      command !== 'run-matrix'
    )
      selection.overrides![axis] = choices[0]!;
    else throw new Error(`Unknown matrix axis: ${axis}`);
  }
  const cells = matrix.count(selection);
  if (!cells) throw new Error('Selection contains no cells');
  const trials = parsed.trials ?? project.config.execution?.trials;
  const plan = {
    matrix: authoringId(matrix),
    evals: requestedEvals,
    cells,
    parameters: selection.parameters,
    overrides: selection.overrides,
    trials: trials ?? 'eval policy',
  };
  if (values['dry-run']) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (cells > (project.config.execution?.maxCells ?? 100) && !values.all)
    throw new Error(
      `Selected ${cells} cells. Narrow the selection, inspect --dry-run, or pass --all.`,
    );
  if (!values.json) console.log(`Running ${cells} cell(s) from ${plan.matrix}`);
  const summary = await Effect.runPromise(
    runMatrix(matrix, {
      selection,
      concurrency:
        parsed.concurrency ?? project.config.execution?.concurrency ?? 4,
      trials,
      ...(suiteId ? { suiteId } : {}),
      ...(values.local ? { runtime: 'local' as const } : {}),
      report: localReportStore(
        resolve(project.root, project.config.reportDir ?? '_evalkit-results'),
      ),
      workspaceRoot: resolve(
        project.root,
        project.config.sandboxDir ?? '_evalkit-sandbox',
      ),
      onResult: (cell, result) => {
        if (values.json)
          console.log(
            JSON.stringify({
              cell: {
                key: cell.key,
                eval: authoringId(cell.eval),
                parameters: cell.parameters,
              },
              result,
            }),
          );
        else {
          const passed =
            result.status === 'completed' &&
            (result.aggregateScoring?.passRate === 1 || result.scoring?.passed);
          console.log(
            `${passed ? 'PASS' : 'FAIL'} ${cell.eval.name ?? authoringId(cell.eval)} ${JSON.stringify(cell.parameters)}\n  report: ${result.reportLocation}`,
          );
          for (const trial of result.trials ?? [result]) {
            for (const checkpoint of trial.scoring?.checkpoints ?? [])
              console.log(
                `  step ${checkpoint.step} ${checkpoint.kind} ${checkpoint.name}: ${checkpoint.status}${checkpoint.value === undefined ? '' : ` (${checkpoint.value})`}`,
              );
            for (const score of trial.scoring?.results ?? [])
              console.log(
                `  ${score.kind} ${score.name}: ${score.value ?? 'error'} ${score.explanation ?? ''}`,
              );
          }
        }
      },
    }),
  );
  if (summary.failed) process.exitCode = 1;
}
