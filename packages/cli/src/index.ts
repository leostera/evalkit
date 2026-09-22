#!/usr/bin/env bun

import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { Hono } from 'hono';
import type {
  EvalDefinition,
  EvalRegistry,
  TrajectoryEvent,
  TrialResult,
} from '@evalkit/core';
import { localReportStore, runEval } from '@evalkit/runner';

type LocalRun = {
  id: string;
  evalId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  completedTrials: number;
  requestedTrials: number;
  score?: number;
  durationMs?: number;
};

type LocalTrial = {
  id: string;
  index: number;
  status: LocalRun['status'];
  score?: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
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

function printEvalStart(evaluation: EvalDefinition, suiteId?: string): void {
  console.log(`\n◆ ${evaluation.name ?? evaluation.id}`);
  console.log(
    `  eval     ${suiteId ? `${suiteId}#${evaluation.id}` : evaluation.id}`,
  );
  console.log(`  agent    ${agentLabel(evaluation)}`);
  console.log(
    `  runtime  local (${evaluation.agent.runtimes?.local?.kind ?? 'adapter default'})`,
  );
  console.log(
    `  input    ${evaluation.transcript.length} transcript step(s), ${evaluation.fixtures?.length ?? 0} fixture(s), ${evaluation.scoring.length} scorer(s)`,
  );
}

function printResult(
  evaluation: EvalDefinition,
  result: TrialResult,
  durationMs: number,
  measurements: TrajectoryMeasurements,
): void {
  const symbol = result.status === 'completed' ? '✓' : '✗';
  console.log(`  ${symbol} ${result.status} in ${durationMs}ms`);
  for (const score of result.scoring?.results ?? []) {
    const value = score.value === undefined ? 'error' : `${score.value * 100}%`;
    console.log(`    score   ${score.name}: ${value} (${score.durationMs}ms)`);
    if (score.explanation) console.log(`            ${score.explanation}`);
  }
  console.log(
    `    events  ${measurements.eventCount} total (${measurements.autEventCount} AUT, ${measurements.runnerEventCount} runner)`,
  );
  if (
    measurements.turnLatencyMs ||
    measurements.inputTokens ||
    measurements.outputTokens
  ) {
    console.log(
      `    usage   ${measurements.turnLatencyMs}ms turn latency, ${measurements.inputTokens} input tokens, ${measurements.outputTokens} output tokens`,
    );
  }
  console.log(`    report  ${result.reportLocation}`);
  if (result.error)
    console.log(`    error   ${result.error.name}: ${result.error.message}`);
  void evaluation;
}

async function runEvals(options: {
  evalIds?: string[];
  json: boolean;
  suiteId?: string;
  suiteName?: string;
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
    registry.metadata().map((metadata) => [metadata.id, metadata.suiteId]),
  );
  let failed = false;
  for (const evaluation of evaluations) {
    if (!evaluation) continue;
    const suiteId = options.suiteId ?? suiteIdByEvalId.get(evaluation.id);
    const trialCount = evaluation.policy?.trials ?? 1;
    if (!options.json) {
      printEvalStart(evaluation, suiteId);
      console.log(`  trials   ${trialCount}`);
    }
    const startedAt = performance.now();
    const aggregate = await Effect.runPromise(
      runEval(evaluation, {
        report: localReportStore(reportRoot),
        ...(suiteId ? { suiteId } : {}),
        runtime: 'local',
      }),
    );
    const trialResults = aggregate.trials ?? [aggregate];
    for (const [index, result] of trialResults.entries()) {
      if (!options.json && trialCount > 1)
        console.log(`\n  Trial ${index + 1}/${trialCount}`);
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
      else printResult(evaluation, result, 0, measurements);
      failed ||= result.status !== 'completed';
    }
    if (!options.json && trialCount > 1)
      console.log(
        `\n  run     ${aggregate.runId} (${Math.round(performance.now() - startedAt)}ms aggregate)`,
      );
  }
  if (failed) process.exitCode = 1;
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
          readJson<{ evalId: string; startedAt: string }>(
            `${directory}/manifest.json`,
          ),
          readJson<{
            status: LocalRun['status'];
            endedAt: string;
            durationMs?: number;
            trialCount: number;
          }>(`${directory}/summary.json`),
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
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('Invalid run ID');
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
          scoring?: { overall?: number };
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
      };
    }),
  );
  return trials.sort((left, right) => left.index - right.index);
}

async function readTrialDetail(runId: string, trialId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(runId) || !/^[A-Za-z0-9_-]+$/.test(trialId))
    throw new Error('Invalid report ID');
  const root = resolve(reportRoot, runId, 'trials', trialId);
  return {
    manifest: await readJson(resolve(root, 'manifest.json')),
    summary: await readJson(resolve(root, 'summary.json')),
  };
}

async function listTrialArtifacts(runId: string, trialId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(runId) || !/^[A-Za-z0-9_-]+$/.test(trialId))
    throw new Error('Invalid report ID');
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

async function readTrajectory(
  runId: string,
  trialId: string,
): Promise<unknown[]> {
  if (!/^[A-Za-z0-9_-]+$/.test(runId) || !/^[A-Za-z0-9_-]+$/.test(trialId))
    throw new Error('Invalid report ID');
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
      evalIds: [evaluation.id],
      suiteId,
      suiteName: registeredSuite?.name,
    });
    return context.json({ accepted: true }, 202);
  });
  app.post('/v1/suites/:suiteId/runs', async (context) => {
    const suite = registry.getSuite(context.req.param('suiteId'));
    if (!suite) return context.text('Unknown suite', 404);
    void runEvals({
      json: false,
      evalIds: suite.evals.map((evaluation) => evaluation.id),
      suiteId: suite.id,
      suiteName: suite.name,
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
  app.get('/v1/runs/:runId/trials/:trialId/trajectory', async (context) => {
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
  console.log(`Evalkit dashboard: http://localhost:${server.port}`);
}

const [command = 'help', ...arguments_] = process.argv.slice(2);
const flags = new Set(
  arguments_.filter((argument) => argument.startsWith('--')),
);
const evalId = arguments_.find((argument) => !argument.startsWith('--'));
if (command === 'run-evals')
  await runEvals({
    evalIds: evalId ? [evalId] : undefined,
    json: flags.has('--json'),
  });
else if (command === 'run-suite') {
  if (!evalId) throw new Error('run-suite requires a suite ID');
  const suite = (await loadRegistry()).getSuite(evalId);
  if (!suite) throw new Error(`Unknown suite: ${evalId}`);
  await runEvals({
    evalIds: suite.evals.map((evaluation) => evaluation.id),
    json: flags.has('--json'),
    suiteId: suite.id,
    suiteName: suite.name,
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
