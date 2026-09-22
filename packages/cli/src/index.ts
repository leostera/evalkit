#!/usr/bin/env bun

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { Hono } from 'hono';
import {
  RunMetadataSchema,
  RunSummarySchema,
  type EvalDefinition,
  type EvalRegistry,
  type TrajectoryEvent,
  type TrialResult,
} from '@evalkit/core';
import { localReportStore, runEval } from '@evalkit/runner';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const colorEnabled =
  process.env.NO_COLOR === undefined &&
  (process.env.FORCE_COLOR === '1' || process.stdout.isTTY === true);

function color(code: number, value: string): string {
  return colorEnabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

const paint = {
  blue: (value: string) => color(34, value),
  cyan: (value: string) => color(36, value),
  dim: (value: string) => color(2, value),
  green: (value: string) => color(32, value),
  magenta: (value: string) => color(35, value),
  red: (value: string) => color(31, value),
  yellow: (value: string) => color(33, value),
};

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${label}`);
}

type LocalRun = {
  id: string;
  evalId: string;
  suiteId?: string;
  agent?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
};

type LocalScore = {
  name: string;
  value?: number;
  passed: boolean;
  explanation?: string;
  durationMs: number;
};
type LocalTrial = {
  id: string;
  index: number;
  status: LocalRun['status'];
  score?: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  scores: LocalScore[];
};

type TrajectoryMeasurements = {
  eventCount: number;
  autEventCount: number;
  runnerEventCount: number;
  turnLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
};

const projectRoot = process.cwd();
const reportRoot = resolve(projectRoot, 'evalkit-results');

async function loadRegistry(): Promise<EvalRegistry> {
  const registryFile = pathToFileURL(
    resolve(projectRoot, 'src/registry.ts'),
  ).href;
  const module = (await import(registryFile)) as { default?: EvalRegistry };
  if (!module.default?.get || !module.default?.evals) {
    throw new Error('src/registry.ts must default-export registerEvals([...])');
  }
  return module.default;
}

function agentLabel(evaluation: EvalDefinition): string {
  const identity = evaluation.agent.identity;
  if (!identity) return 'unidentified agent';
  return [
    identity.kind,
    identity.uri,
    identity.version && `v${identity.version}`,
  ]
    .filter(Boolean)
    .join(' / ');
}

async function measureTrajectory(
  runId: string,
  trialId: string,
): Promise<TrajectoryMeasurements> {
  const file = resolve(
    reportRoot,
    runId,
    'trials',
    trialId,
    'trajectory.jsonl',
  );
  const events = (await readFile(file, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TrajectoryEvent);
  return events.reduce<TrajectoryMeasurements>(
    (measurements, event) => {
      measurements.eventCount += 1;
      if (event.source === 'aut') measurements.autEventCount += 1;
      else measurements.runnerEventCount += 1;
      if (event.kind === 'turn-completed') {
        measurements.turnLatencyMs += event.latencyMs ?? 0;
        measurements.inputTokens += event.usage?.inputTokens ?? 0;
        measurements.outputTokens += event.usage?.outputTokens ?? 0;
      }
      return measurements;
    },
    {
      eventCount: 0,
      autEventCount: 0,
      runnerEventCount: 0,
      turnLatencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  );
}

function printEvalStart(evaluation: EvalDefinition): void {
  console.log(
    `\n${paint.cyan('◆')} ${paint.cyan(evaluation.name ?? evaluation.uri)}`,
  );
  console.log(`  ${paint.blue('eval')}     ${paint.dim(evaluation.uri)}`);
  console.log(
    `  ${paint.blue('agent')}    ${paint.magenta(agentLabel(evaluation))}`,
  );
  console.log(
    `  ${paint.blue('runtime')}  ${paint.green('local')} (${evaluation.agent.runtimes?.local?.kind ?? 'adapter default'})`,
  );
  console.log(
    `  ${paint.blue('input')}    ${evaluation.transcript.length} transcript step(s), ${evaluation.fixtures?.length ?? 0} fixture(s), ${evaluation.scoring.length} scorer(s)`,
  );
}

function printResult(
  evaluation: EvalDefinition,
  result: TrialResult,
  durationMs: number,
  measurements: TrajectoryMeasurements,
): void {
  const passed = result.status === 'completed';
  const symbol = passed ? paint.green('✓') : paint.red('✗');
  console.log(
    `  ${symbol} ${passed ? paint.green(result.status) : paint.red(result.status)} in ${paint.dim(`${durationMs}ms`)}`,
  );
  for (const score of result.scoring?.results ?? []) {
    const value = score.value === undefined ? 'error' : `${score.value * 100}%`;
    const scoreColor =
      score.error || score.passed === false ? paint.red : paint.green;
    console.log(
      `    ${paint.blue('score')}   ${score.name}: ${scoreColor(value)} ${paint.dim(`(${score.durationMs}ms)`)}`,
    );
    if (score.explanation)
      console.log(`            ${paint.dim(score.explanation)}`);
  }
  console.log(
    `    ${paint.blue('events')}  ${measurements.eventCount} total (${measurements.autEventCount} AUT, ${measurements.runnerEventCount} runner)`,
  );
  if (
    measurements.turnLatencyMs ||
    measurements.inputTokens ||
    measurements.outputTokens
  ) {
    console.log(
      `    ${paint.blue('usage')}   ${measurements.turnLatencyMs}ms turn latency, ${measurements.inputTokens} input tokens, ${measurements.outputTokens} output tokens`,
    );
  }
  console.log(
    `    ${paint.blue('report')}  ${paint.dim(result.reportLocation)}`,
  );
  if (result.error)
    console.log(
      `    ${paint.red('error')}   ${result.error.name}: ${result.error.message}`,
    );
  void evaluation;
}

async function runEvals(options: {
  evalIds?: string[];
  json: boolean;
  suiteId?: string;
  suiteName?: string;
  concurrency: number;
}): Promise<void> {
  const registry = await loadRegistry();
  const evaluations = options.evalIds
    ? options.evalIds.map((id) => registry.get(id))
    : registry.evals;
  if (evaluations.some((evaluation) => !evaluation)) {
    throw new Error(`Unknown eval: ${options.evalIds?.join(', ')}`);
  }

  if (!options.json && options.suiteId) {
    console.log(
      `\nSuite: ${options.suiteId}${options.suiteName ? ` — ${options.suiteName}` : ''}`,
    );
  }

  const suiteIdByEvalId = new Map(
    registry.metadata().map((metadata) => [metadata.uri, metadata.suiteUri]),
  );
  const semaphore = Effect.unsafeMakeSemaphore(options.concurrency);
  const jobs = evaluations
    .filter(
      (evaluation): evaluation is EvalDefinition => evaluation !== undefined,
    )
    .map((evaluation) =>
      Effect.tryPromise({
        try: async () => {
          const suiteId =
            options.suiteId ?? suiteIdByEvalId.get(evaluation.uri);
          const trialCount = evaluation.policy?.trials ?? 1;
          if (!options.json) {
            printEvalStart(evaluation);
            console.log(`  trials   ${trialCount}`);
          }
          const startedAt = performance.now();
          const aggregate = await Effect.runPromise(
            runEval(evaluation, {
              report: localReportStore(reportRoot),
              ...(suiteId ? { suiteId } : {}),
              runtime: 'local',
              concurrency: options.concurrency,
              semaphore,
            }),
          );
          const trialResults = aggregate.trials ?? [aggregate];
          let failed = false;
          for (const [index, result] of trialResults.entries()) {
            if (!options.json && trialCount > 1)
              console.log(
                `\n  ${paint.yellow(`Trial ${index + 1}/${trialCount}`)}`,
              );
            const measurements = await measureTrajectory(
              result.runId,
              result.trialId,
            );
            if (options.json)
              console.log(
                JSON.stringify({
                  ...result,
                  trial: index + 1,
                  trialCount,
                  measurements,
                }),
              );
            else
              printResult(
                evaluation,
                result,
                result.durationMs ?? 0,
                measurements,
              );
            failed ||= result.status !== 'completed';
          }
          if (!options.json && trialCount > 1)
            console.log(
              `\n  ${paint.cyan('run')}     ${paint.dim(aggregate.runId)} (${Math.round(performance.now() - startedAt)}ms aggregate)`,
            );
          return failed;
        },
        catch: (error) => error,
      }),
    );
  const failed = await Effect.runPromise(
    Effect.all(jobs, { concurrency: options.concurrency }),
  );
  if (failed.some(Boolean)) process.exitCode = 1;
}

async function listLocalRuns(): Promise<LocalRun[]> {
  let entries: string[];
  try {
    entries = await readdir(reportRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const runs = await Promise.all(
    entries.map(async (id) => {
      const directory = resolve(reportRoot, id);
      try {
        const [manifest, summary] = await Promise.all([
          readSchema(`${directory}/manifest.json`, RunMetadataSchema),
          readSchema(`${directory}/summary.json`, RunSummarySchema),
        ]);
        const trialIds = await readdir(`${directory}/trials`);
        const trials = await Promise.all(
          trialIds.map((trialId) =>
            readJson<{ durationMs?: number; scoring?: { overall?: number } }>(
              `${directory}/trials/${trialId}/summary.json`,
            ),
          ),
        );
        const scores = trials.flatMap((trial) =>
          trial.scoring?.overall === undefined ? [] : [trial.scoring.overall],
        );
        return {
          id,
          evalId: manifest.evalId,
          ...(manifest.suiteId ? { suiteId: manifest.suiteId } : {}),
          ...(manifest.aut
            ? {
                agent: [
                  manifest.aut.kind,
                  manifest.aut.uri,
                  manifest.aut.version,
                ]
                  .filter(Boolean)
                  .join(' / '),
              }
            : {}),
          status: summary.status,
          startedAt: manifest.startedAt,
          ...(summary.endedAt ? { completedAt: summary.endedAt } : {}),
          ...(summary.durationMs !== undefined
            ? { durationMs: summary.durationMs }
            : {}),
          completedTrials: summary.trialCount,
          requestedTrials: summary.trialCount,
          ...(scores.length
            ? {
                score:
                  scores.reduce((sum, score) => sum + score, 0) / scores.length,
              }
            : {}),
        };
      } catch {
        return undefined;
      }
    }),
  );
  return runs.filter((run): run is LocalRun => run !== undefined);
}

async function listLocalTrials(runId: string): Promise<LocalTrial[]> {
  assertUuid(runId, 'run ID');
  const trialsRoot = resolve(reportRoot, runId, 'trials');
  let trialIds: string[];
  try {
    trialIds = await readdir(trialsRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const trials = await Promise.all(
    trialIds.map(async (id) => {
      const [manifest, summary] = await Promise.all([
        readJson<{ trialIndex: number; startedAt: string }>(
          resolve(trialsRoot, id, 'manifest.json'),
        ),
        readJson<{
          status: LocalRun['status'];
          endedAt?: string;
          durationMs?: number;
          scoring?: { overall?: number; results: LocalScore[] };
        }>(resolve(trialsRoot, id, 'summary.json')),
      ]);
      return {
        id,
        index: manifest.trialIndex,
        status: summary.status,
        startedAt: manifest.startedAt,
        ...(summary.endedAt ? { completedAt: summary.endedAt } : {}),
        ...(summary.durationMs !== undefined
          ? { durationMs: summary.durationMs }
          : {}),
        ...(summary.scoring?.overall === undefined
          ? {}
          : { score: summary.scoring.overall }),
        scores: summary.scoring?.results ?? [],
      };
    }),
  );
  return trials.sort((left, right) => left.index - right.index);
}

async function readTrialDetail(runId: string, trialId: string) {
  assertUuid(runId, 'run ID');
  assertUuid(trialId, 'trial ID');
  const root = resolve(reportRoot, runId, 'trials', trialId);
  return {
    manifest: await readJson(resolve(root, 'manifest.json')),
    summary: await readJson(resolve(root, 'summary.json')),
  };
}

async function listTrialArtifacts(runId: string, trialId: string) {
  assertUuid(runId, 'run ID');
  assertUuid(trialId, 'trial ID');
  const root = resolve(reportRoot, runId, 'trials', trialId, 'artifacts');
  const result: Array<{
    path: string;
    kind: 'file' | 'directory';
    size?: number;
  }> = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push({ path: relative, kind: 'directory' });
        await visit(resolve(directory, entry.name), relative);
      } else {
        const file = Bun.file(resolve(directory, entry.name));
        result.push({ path: relative, kind: 'file', size: file.size });
      }
    }
  }
  try {
    await visit(root, '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return result;
}

async function listCandidateWorkspace(runId: string, trialId: string) {
  assertUuid(runId, 'run ID');
  assertUuid(trialId, 'trial ID');
  const root = resolve(
    reportRoot,
    runId,
    'trials',
    trialId,
    'artifacts',
    'candidate',
  );
  const result: Array<{
    path: string;
    kind: 'file' | 'directory';
    size?: number;
  }> = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push({ path: relative, kind: 'directory' });
        await visit(resolve(directory, entry.name), relative);
      } else {
        result.push({
          path: relative,
          kind: 'file',
          size: Bun.file(resolve(directory, entry.name)).size,
        });
      }
    }
  }
  try {
    await visit(root, '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return result;
}

async function readCandidateWorkspaceFile(
  runId: string,
  trialId: string,
  relativePath: string,
): Promise<Response> {
  assertUuid(runId, 'run ID');
  assertUuid(trialId, 'trial ID');
  const root = resolve(
    reportRoot,
    runId,
    'trials',
    trialId,
    'artifacts',
    'candidate',
  );
  const file = resolve(root, relativePath);
  if (file !== root && !file.startsWith(`${root}${sep}`))
    throw new Error('Invalid workspace path');
  const info = await stat(file);
  if (!info.isFile()) throw new Error('Workspace path is not a file');
  return new Response(await Bun.file(file).arrayBuffer(), {
    headers: { 'content-type': contentType(file) },
  });
}

async function readTrajectory(
  runId: string,
  trialId: string,
): Promise<unknown[]> {
  assertUuid(runId, 'run ID');
  assertUuid(trialId, 'trial ID');
  const contents = await readFile(
    resolve(reportRoot, runId, 'trials', trialId, 'trajectory.jsonl'),
    'utf8',
  );
  return contents
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function readSchema<A, I>(
  file: string,
  schema: Schema.Schema<A, I>,
): Promise<A> {
  return Schema.decodeUnknownSync(schema)(
    JSON.parse(await readFile(file, 'utf8')),
  );
}
function contentType(file: string): string {
  return (
    { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' }[
      extname(file)
    ] ?? 'application/octet-stream'
  );
}

async function serveDashboard(): Promise<void> {
  const registry = await loadRegistry();
  const dashboardRoot = fileURLToPath(
    new URL('../../dashboard/dist/', import.meta.url),
  );
  const app = new Hono();
  app.post('/v1/runs', async (context) => {
    const body = (await context.req.json()) as { path?: unknown };
    if (typeof body.path !== 'string')
      return context.text('path is required', 400);
    const [suiteId, evalId] = body.path.includes('#')
      ? body.path.split('#', 2)
      : [undefined, body.path];
    const evaluation = registry.get(evalId!);
    const registeredSuite = suiteId ? registry.getSuite(suiteId) : undefined;
    if (
      !evaluation ||
      (suiteId && !registeredSuite?.evals.includes(evaluation))
    )
      return context.text('Unknown eval', 404);
    void runEvals({
      json: false,
      evalIds: [evaluation.uri],
      suiteId,
      suiteName: registeredSuite?.name,
      concurrency: 32,
    });
    return context.json({ accepted: true }, 202);
  });
  app.post('/v1/suites/:suiteId/runs', async (context) => {
    const suite = registry.getSuite(context.req.param('suiteId'));
    if (!suite) return context.text('Unknown suite', 404);
    void runEvals({
      json: false,
      evalIds: suite.evals.map((evaluation) => evaluation.uri),
      suiteId: suite.uri,
      suiteName: suite.name,
      concurrency: 32,
    });
    return context.json({ accepted: true }, 202);
  });
  app.get('/v1/catalog', (context) =>
    context.json({ evals: registry.catalog() }),
  );
  app.get('/v1/evals', (context) =>
    context.json({ evals: registry.metadata() }),
  );
  app.get('/v1/suites', (context) =>
    context.json({ suites: registry.suiteMetadata() }),
  );
  app.get('/v1/runs', async (context) =>
    context.json({ runs: await listLocalRuns() }),
  );
  app.get('/v1/runs/:runId/trials', async (context) => {
    try {
      return context.json({
        trials: await listLocalTrials(context.req.param('runId')),
      });
    } catch (error) {
      return context.text(
        error instanceof Error ? error.message : 'Bad request',
        400,
      );
    }
  });
  app.get('/v1/runs/:runId/trials/:trialId', async (context) => {
    try {
      return context.json(
        await readTrialDetail(
          context.req.param('runId'),
          context.req.param('trialId'),
        ),
      );
    } catch (error) {
      return context.text(
        error instanceof Error ? error.message : 'Not found',
        404,
      );
    }
  });
  app.get('/v1/runs/:runId/trials/:trialId/workspace', async (context) => {
    try {
      return context.json(
        await listCandidateWorkspace(
          context.req.param('runId'),
          context.req.param('trialId'),
        ),
      );
    } catch (error) {
      return context.text(
        error instanceof Error ? error.message : 'Unable to list workspace',
        400,
      );
    }
  });
  app.get('/v1/runs/:runId/trials/:trialId/workspace/*', async (context) => {
    try {
      return await readCandidateWorkspaceFile(
        context.req.param('runId'),
        context.req.param('trialId'),
        context.req.param('*') ?? '',
      );
    } catch (error) {
      return context.text(
        error instanceof Error
          ? error.message
          : 'Unable to read workspace file',
        400,
      );
    }
  });
  app.get('/v1/runs/:runId/trials/:trialId/artifacts', async (context) => {
    try {
      return context.json({
        artifacts: await listTrialArtifacts(
          context.req.param('runId'),
          context.req.param('trialId'),
        ),
      });
    } catch (error) {
      return context.text(
        error instanceof Error ? error.message : 'Not found',
        404,
      );
    }
  });
  app.get('/v1/runs/:runId/trials/:trialId/events', async (context) => {
    try {
      return context.json({
        events: await readTrajectory(
          context.req.param('runId'),
          context.req.param('trialId'),
        ),
      });
    } catch (error) {
      return context.text(
        error instanceof Error ? error.message : 'Not found',
        404,
      );
    }
  });
  app.all('*', async (context) => {
    const url = new URL(context.req.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = resolve(dashboardRoot, `.${pathname}`);
    if (!file.startsWith(dashboardRoot)) return context.text('Not found', 404);
    const content = Bun.file(file);
    if (!(await content.exists())) return context.text('Not found', 404);
    return new Response(content, {
      headers: { 'content-type': contentType(file) },
    });
  });
  const server = Bun.serve({
    port: Number(process.env.PORT ?? 4317),
    fetch: app.fetch,
  });
  const url = `http://localhost:${server.port}`;
  console.log(`Evalkit dashboard: ${url}`);
  if (process.env.EVALKIT_NO_OPEN !== '1') {
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';
    try {
      Bun.spawn([opener, url], { stdout: 'ignore', stderr: 'ignore' });
    } catch {
      // Opening a browser is best-effort; the printed URL remains authoritative.
    }
  }
}

const [command = 'help', ...arguments_] = process.argv.slice(2);
const flags = new Set(
  arguments_.filter((argument) => argument.startsWith('--')),
);
const evalId = arguments_.find((argument) => !argument.startsWith('--'));
const concurrencyArgument = arguments_.find((argument) =>
  argument.startsWith('--concurrency='),
);
const concurrency = Number(
  concurrencyArgument?.split('=', 2)[1] ??
    process.env.EVALKIT_CONCURRENCY ??
    32,
);
if (!Number.isInteger(concurrency) || concurrency < 1)
  throw new Error(
    `Concurrency must be a positive integer; received ${concurrency}`,
  );
if (command === 'run-evals')
  await runEvals({
    evalIds: evalId ? [evalId] : undefined,
    json: flags.has('--json'),
    concurrency,
  });
else if (command === 'run-suite') {
  if (!evalId) throw new Error('run-suite requires a suite ID');
  const suite = (await loadRegistry()).getSuite(evalId);
  if (!suite) throw new Error(`Unknown suite: ${evalId}`);
  await runEvals({
    evalIds: suite.evals.map((evaluation) => evaluation.uri),
    json: flags.has('--json'),
    suiteId: suite.uri,
    suiteName: suite.name,
    concurrency,
  });
} else if (command === 'serve-dashboard') await serveDashboard();
else if (command === 'help' || command === '--help')
  console.log(
    'evalkit\n\nCommands:\n  run-evals [eval-id] [--local] [--json]\n  run-suite <suite-id> [--local] [--json]\n  serve-dashboard\n',
  );
else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}
