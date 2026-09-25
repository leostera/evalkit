#!/usr/bin/env bun

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { Hono } from 'hono';
import {
  authoringId,
  type EvalDefinition,
  type EvalRegistry,
  type JsonObject,
  type AgentRuntimeName,
  type CheckpointResult,
  type TrajectoryEvent,
  type TrialResult,
} from '@evalkit/core';
import {
  localReportStore,
  runEval,
  runMatrix,
  readRunManifest,
  readRunSummary,
  readTrialManifest,
  readTrialSummary,
  readTrialEvents,
} from '@evalkit/runner';
import { selectDashboardCell } from './dashboard-matrix.js';
import { loadProject } from './project.js';
import { parseRunArgs, runProjectCommand } from './run-command.js';

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

type PersistedStatus = 'running' | 'completed' | 'failed' | 'cancelled';

type LocalRun = {
  id: string;
  evalId: string;
  suiteId?: string;
  agent?: string;
  matrixId?: string;
  parameters?: JsonObject;
  status: 'running' | 'passed' | 'failed' | 'errored';
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
};

type LocalScore = {
  name: string;
  kind?: 'predicate' | 'judge';
  value?: number;
  passed?: boolean;
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
  checkpoints: CheckpointResult[];
  skippedScorers?: string[];
};

type TrajectoryMeasurements = {
  eventCount: number;
  autEventCount: number;
  runnerEventCount: number;
  turnLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
};

let projectRoot = process.cwd();
let reportRoot = resolve(projectRoot, '_evalkit-results');
const sandboxRoot = resolve(projectRoot, '_evalkit-sandbox');
let project: Awaited<ReturnType<typeof loadProject>> | undefined;

function dashboardRunStatus(summary: {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  passed: number;
  failed: number;
  trialCount: number;
}): LocalRun['status'] {
  if (summary.status === 'running') return 'running';
  if (summary.status !== 'completed') return 'errored';
  return summary.failed === 0 && summary.passed === summary.trialCount
    ? 'passed'
    : 'failed';
}

function dashboardTrialStatus(summary: {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  scoring?: { passed?: boolean };
}): LocalTrial['status'] {
  if (summary.status === 'running') return 'running';
  if (summary.status !== 'completed') return 'errored';
  return summary.scoring?.passed === true ? 'passed' : 'failed';
}

async function loadRegistry(): Promise<EvalRegistry> {
  project ??= await loadProject(projectRoot);
  return project.registry;
}

function runtimeFor(evaluation: EvalDefinition): AgentRuntimeName | undefined {
  for (const runtime of ['local', 'remote', 'sandbox'] as const) {
    if (evaluation.agent.runtimes?.[runtime]) return runtime;
  }
  return undefined;
}

function agentLabel(evaluation: EvalDefinition): string {
  const identity = evaluation.agent.identity;
  if (!identity) return 'unidentified agent';
  return [
    identity.kind,
    identity.id,
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
    `\n${paint.cyan('◆')} ${paint.cyan(evaluation.name ?? authoringId(evaluation))}`,
  );
  console.log(
    `  ${paint.blue('eval')}     ${paint.dim(authoringId(evaluation))}`,
  );
  console.log(
    `  ${paint.blue('agent')}    ${paint.magenta(agentLabel(evaluation))}`,
  );
  const runtime = runtimeFor(evaluation);
  console.log(
    `  ${paint.blue('runtime')}  ${paint.green(runtime ?? 'default')} (${runtime ? evaluation.agent.runtimes?.[runtime]?.kind : 'adapter default'})`,
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
  evalIds: string[];
  suiteId?: string;
  concurrency: number;
}): Promise<void> {
  const registry = await loadRegistry();
  const evaluations = options.evalIds.map((id) => registry.get(id));
  if (evaluations.some((e) => !e)) throw new Error('Unknown eval');
  await Effect.runPromise(
    Effect.all(
      evaluations.map((evaluation) =>
        runEval(evaluation!, {
          report: localReportStore(reportRoot),
          workspaceRoot: sandboxRoot,
          suiteId: options.suiteId,
          runtime: runtimeFor(evaluation!),
          concurrency: options.concurrency,
        }),
      ),
      { concurrency: options.concurrency },
    ),
  );
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
        const manifest = await readRunManifest(reportRoot, id);
        const summary = await readRunSummary(reportRoot, id).catch(
          (error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
              return undefined;
            throw error;
          },
        );
        const trialIds = await readdir(`${directory}/trials`).catch(
          (error: unknown): string[] => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
          },
        );
        const trials = await Promise.all(
          trialIds.map((trialId) =>
            readTrialSummary(reportRoot, id, trialId).catch(
              (error: unknown) => {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                  return undefined;
                throw error;
              },
            ),
          ),
        );
        const scores = trials.flatMap((trial) =>
          trial?.scoring?.overall === undefined ? [] : [trial.scoring.overall],
        );
        return {
          id,
          evalId: manifest.evalId,
          ...(manifest.suiteId ? { suiteId: manifest.suiteId } : {}),
          ...(manifest.matrix ? { matrixId: manifest.matrix.id } : {}),
          ...(manifest.parameters ? { parameters: manifest.parameters } : {}),
          ...(manifest.aut
            ? {
                agent: [
                  manifest.aut.kind,
                  manifest.aut.id,
                  manifest.aut.version,
                ]
                  .filter(Boolean)
                  .join(' / '),
              }
            : {}),
          status: summary ? dashboardRunStatus(summary) : 'running',
          startedAt: manifest.startedAt,
          ...(summary?.endedAt ? { completedAt: summary.endedAt } : {}),
          ...(summary?.durationMs !== undefined
            ? { durationMs: summary.durationMs }
            : {}),
          completedTrials: summary?.trialCount ?? trials.filter(Boolean).length,
          requestedTrials:
            summary?.trialCount ??
            project?.registry.get(manifest.evalId)?.policy?.trials ??
            1,
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
      const manifest = await readTrialManifest(reportRoot, runId, id);
      const summary = await readTrialSummary(reportRoot, runId, id).catch(
        (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined;
          throw error;
        },
      );
      return {
        id,
        index: manifest.trialIndex,
        status: summary ? dashboardTrialStatus(summary) : 'running',
        startedAt: manifest.startedAt,
        ...(summary?.endedAt ? { completedAt: summary.endedAt } : {}),
        ...(summary?.durationMs !== undefined
          ? { durationMs: summary.durationMs }
          : {}),
        ...(summary?.scoring?.overall === undefined
          ? {}
          : { score: summary.scoring.overall }),
        scores: summary?.scoring?.results ?? [],
        checkpoints: summary?.scoring?.checkpoints ?? [],
        ...(summary?.scoring?.skippedScorers
          ? { skippedScorers: summary.scoring.skippedScorers }
          : {}),
      };
    }),
  );
  return trials.sort((left, right) => left.index - right.index);
}

async function readTrialDetail(runId: string, trialId: string) {
  assertUuid(runId, 'run ID');
  assertUuid(trialId, 'trial ID');
  return {
    manifest: await readTrialManifest(reportRoot, runId, trialId),
    summary: await readTrialSummary(reportRoot, runId, trialId).catch(
      (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return { status: 'running' };
        throw error;
      },
    ),
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
  return readTrialEvents(reportRoot, runId, trialId).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
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
  const bundledDashboard = new URL('./dashboard/', import.meta.url);
  const dashboardRoot = fileURLToPath(
    existsSync(bundledDashboard)
      ? bundledDashboard
      : new URL('../../dashboard/dist/', import.meta.url),
  );
  const app = new Hono();
  const dashboardMatrix = project?.config.matrix
    ? registry.matrices.at(-1)
    : undefined;
  let matrixRunning = false;
  app.get('/v1/matrix', (context) =>
    context.json({
      matrix: dashboardMatrix
        ? {
            id: dashboardMatrix.id,
            parameters: dashboardMatrix.parameters,
            ...(project?.config.execution?.trials
              ? { trials: project.config.execution.trials }
              : {}),
          }
        : null,
    }),
  );
  app.post('/v1/runs', async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      path?: unknown;
      parameters?: unknown;
    } | null;
    if (!body || typeof body.path !== 'string')
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
    if (dashboardMatrix) {
      let selection;
      try {
        selection = selectDashboardCell(
          dashboardMatrix,
          authoringId(evaluation),
          body.parameters,
        );
      } catch (error) {
        return context.text(
          error instanceof Error ? error.message : 'Invalid selection',
          400,
        );
      }
      if (matrixRunning)
        return context.text('A dashboard matrix cell is already running', 409);
      matrixRunning = true;
      void Effect.runPromise(
        runMatrix(dashboardMatrix, {
          selection,
          concurrency: 1,
          trials: project?.config.execution?.trials,
          ...(suiteId ? { suiteId } : {}),
          report: localReportStore(reportRoot),
          workspaceRoot: sandboxRoot,
        }),
      )
        .catch((error) => console.error('Dashboard matrix run failed:', error))
        .finally(() => {
          matrixRunning = false;
        });
    } else {
      if (body.parameters !== undefined)
        return context.text('Project has no matrix', 400);
      void runEvals({
        evalIds: [authoringId(evaluation)],
        suiteId,
        concurrency: 32,
      }).catch((error) => console.error('Dashboard run failed:', error));
    }
    return context.json({ accepted: true }, 202);
  });
  app.post('/v1/suites/:suiteId/runs', async (context) => {
    if (dashboardMatrix)
      return context.text('Select a single eval and matrix cell', 400);
    const suite = registry.getSuite(context.req.param('suiteId'));
    if (!suite) return context.text('Unknown suite', 404);
    void runEvals({
      evalIds: suite.evals.map(authoringId),
      suiteId: authoringId(suite),
      concurrency: 32,
    }).catch((error) => console.error('Dashboard suite run failed:', error));
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
    let content = Bun.file(file);
    let servedFile = file;
    if (!(await content.exists())) {
      // React Router owns browser routes, so refreshes must receive the SPA
      // entry point instead of being treated as missing static files.
      if (extname(pathname)) return context.text('Not found', 404);
      servedFile = resolve(dashboardRoot, 'index.html');
      content = Bun.file(servedFile);
    }
    return new Response(content, {
      headers: { 'content-type': contentType(servedFile) },
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
try {
  // Help must not load a project or parse run flags: it works even in an empty directory.
  if (
    command === 'help' ||
    command === '--help' ||
    (['run-evals', 'run-matrix', 'run-suite', 'serve-dashboard'].includes(
      command,
    ) &&
      arguments_.some((arg) => arg === '--help' || arg === '-h'))
  ) {
    console.log(`evalkit

Commands:
  run-evals [eval-id,...]
  run-matrix <matrix-id>
  run-suite <suite-id>
  serve-dashboard

Project: evalkit.config.js / .ts, with default discovery in evals/**/*.eval.{ts,js}
Run options:
  --config <file>               Select project configuration
  --eval <eval-id,...>             Select tasks
  --model <key,...> --mode <key,...>  Select matrix values
  --select <axis=value>         Select any custom axis (repeatable)
  --param <name=JSON>           Override non-axis agent parameters
  --max-tokens <n> --turn-budget <n> --chat-timeout-ms <n>
  --concurrency <n> --trials <n>
  --dry-run                    Show plan without starting agents
  --all                        Permit plans above the safety limit
  --json                       Emit results as JSON
  --local                      Use a declared local AUT runtime
  -h, --help                   Show this help without loading the project
`);
  } else if (['run-evals', 'run-matrix', 'run-suite'].includes(command)) {
    await runProjectCommand(command, arguments_);
  } else if (command === 'serve-dashboard') {
    const { values } = parseRunArgs(arguments_);
    project = await loadProject(projectRoot, values.config);
    projectRoot = project.root;
    reportRoot = resolve(
      projectRoot,
      project.config.reportDir ?? '_evalkit-results',
    );
    await serveDashboard();
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
