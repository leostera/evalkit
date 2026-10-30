#!/usr/bin/env bun

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Option } from 'effect';
import { Args, Command, Options } from '@effect/cli';
import { NodeContext } from '@effect/platform-node';
import { Hono } from 'hono';
import {
  agentRuntimes,
  authoringId,
  type EvalDefinition,
  type EvalRegistry,
  type AgentRuntimeName,
} from '@evalkit/core';
import { localReportStore, runEval, runMatrix } from '@evalkit/runner';
import { buildDashboard, directorySize } from './dashboard-build.js';
import { listMatrixCells } from './dashboard-cells.js';
import {
  createDashboardReportReader,
  fileContentType,
} from './dashboard-reports.js';
import { selectDashboardCell } from './dashboard-matrix.js';
import { loadProject } from './project.js';
import {
  normalizeRunOptions,
  parseRunArgs,
  printLoadErrors,
  runProjectCommand,
} from './run-command.js';
import { tidyReports } from './tidy.js';
import { detectSource, runCatalog, shortSource } from './source.js';
import {
  checkShareServer,
  noRunsMessage,
  resolveShareHeaders,
  selectionSummary,
  selectRuns,
  shareRuns,
  shareTarget,
} from './share-command.js';
import { createDirectoryShareApp, repoKey } from '@evalkit/share';
import { newProject } from './new-project.js';
import {
  compareRuns,
  comparisonLines,
  comparisonMarkdown,
  gateFailures,
  parseFailOn,
  type ComparedRun,
} from './compare.js';
import {
  baseRunsFromDirectory,
  baseRunsFromServer,
  headRuns,
} from './compare-command.js';
import {
  banner,
  bold,
  canPrompt,
  confirm,
  bytes,
  cyan,
  dim,
  duration,
  plural,
  runLog,
  runnerLogs,
  step,
  yellow,
  red,
  green,
} from './terminal.js';

import { VERSION } from './version.js';

let projectRoot = process.cwd();
let reportRoot = resolve(projectRoot, '_evalkit-results');
const sandboxRoot = resolve(projectRoot, '_evalkit-sandbox');
let project: Awaited<ReturnType<typeof loadProject>> | undefined;

async function loadRegistry(): Promise<EvalRegistry> {
  project ??= await loadProject(projectRoot);
  return project.registry;
}

function runtimeFor(evaluation: EvalDefinition): AgentRuntimeName | undefined {
  for (const runtime of ['local', 'remote', 'sandbox'] as const) {
    if (agentRuntimes(evaluation.agent)[runtime]) return runtime;
  }
  return undefined;
}

async function runEvals(options: {
  evalIds: string[];
  suiteId?: string;
  concurrency: number;
}): Promise<void> {
  const registry = await loadRegistry();
  const evaluations = options.evalIds.map((id) => registry.get(id));
  if (evaluations.some((e) => !e)) throw new Error('Unknown eval');
  const provenance = await runProvenance(registry);
  const invocation = {
    id: randomUUID(),
    selection: {
      ...(options.suiteId ? { suiteId: options.suiteId } : {}),
      evalIds: options.evalIds,
    },
  };
  await Effect.runPromise(
    runnerLogs(
      Effect.all(
        evaluations.map((evaluation) => {
          const name = evaluation!.name ?? authoringId(evaluation!);
          const started = performance.now();
          return Effect.sync(() =>
            runLog.started(name, {}, options.suiteId),
          ).pipe(
            Effect.andThen(
              runEval(evaluation!, {
                report: localReportStore(reportRoot),
                workspaceRoot: sandboxRoot,
                suiteId: options.suiteId,
                invocation,
                runtime: runtimeFor(evaluation!),
                concurrency: options.concurrency,
                ...provenance,
              }),
            ),
            Effect.tap((result) =>
              runLog.finished(name, {}, result, performance.now() - started),
            ),
            Effect.tapError((error) =>
              Effect.sync(() => runLog.failed(name, error)),
            ),
          );
        }),
        { concurrency: options.concurrency },
      ),
    ),
  );
}

/** Detected per launch: `evalkit dev` keeps running while commits change. */
async function runProvenance(registry: EvalRegistry) {
  const source = await detectSource(projectRoot, {
    outputDirs: [
      reportRoot,
      sandboxRoot,
      resolve(projectRoot, '_evalkit-dashboard'),
    ],
  });
  return { ...(source ? { source } : {}), catalog: runCatalog(registry) };
}

function registerMatrixRoutes(
  app: Hono,
  registry: EvalRegistry,
  dashboardMatrix: EvalRegistry['matrices'][number] | undefined,
  trials?: number,
): void {
  let matrixRunning = false;
  app.get('/v1/matrix', (context) =>
    context.json({
      matrix: dashboardMatrix
        ? {
            id: dashboardMatrix.id,
            parameters: dashboardMatrix.parameters,
            ...(dashboardMatrix.cases?.length || dashboardMatrix.exclude?.length
              ? {
                  dimensions: [
                    ...Object.keys(dashboardMatrix.cases?.[0] ?? {}),
                    ...Object.keys(dashboardMatrix.parameters),
                  ],
                }
              : {}),
            ...(dashboardMatrix.cases?.length || dashboardMatrix.exclude?.length
              ? { constrained: true }
              : {}),
            ...(trials ? { trials } : {}),
          }
        : null,
    }),
  );
  app.get('/v1/matrix/cells', (context) => {
    if (!dashboardMatrix) return context.text('Project has no matrix', 404);
    const url = new URL(context.req.url);
    try {
      return context.json(
        listMatrixCells(dashboardMatrix, {
          evalIds: url.searchParams.getAll('eval'),
          query: url.searchParams.get('q') ?? '',
          offset: Number(url.searchParams.get('offset') ?? '0'),
          limit: Number(url.searchParams.get('limit') ?? '50'),
          sort: url.searchParams.get('sort') ?? 'eval',
          direction:
            url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc',
        }),
      );
    } catch (error) {
      return context.text(
        error instanceof Error ? error.message : 'Unable to list cells',
        400,
      );
    }
  });
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
      const name = evaluation.name ?? authoringId(evaluation);
      const started = performance.now();
      runLog.started(name, (body.parameters ?? {}) as object, suiteId);
      void runProvenance(registry)
        .then((provenance) =>
          Effect.runPromise(
            runnerLogs(
              runMatrix(dashboardMatrix, {
                selection,
                concurrency: 1,
                trials,
                ...(suiteId ? { suiteId } : {}),
                report: localReportStore(reportRoot),
                workspaceRoot: sandboxRoot,
                ...provenance,
                onResult: (cell, result) =>
                  runLog.cell(cell, result, performance.now() - started),
              }),
            ),
          ),
        )
        .catch((error) => runLog.failed(name, error))
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
      }).catch(() => {
        /* already reported by runLog */
      });
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
    }).catch(() => {
      /* already reported by runLog */
    });
    return context.json({ accepted: true }, 202);
  });
}

function registerReportRoutes(
  app: Hono,
  registry: EvalRegistry,
  reports: ReturnType<typeof createDashboardReportReader>,
): void {
  app.get('/v1/catalog', (context) =>
    context.json({
      evals: registry.catalog(),
      loadErrors: project?.loadErrors ?? [],
    }),
  );
  app.get('/v1/evals', (context) =>
    context.json({ evals: registry.metadata() }),
  );
  app.get('/v1/suites', (context) =>
    context.json({ suites: registry.suiteMetadata() }),
  );
  app.get('/v1/runs', async (context) =>
    context.json({ runs: await reports.listRuns() }),
  );
  app.get('/v1/runs/:runId/trials', async (context) => {
    try {
      return context.json({
        trials: await reports.listTrials(context.req.param('runId')),
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
        await reports.trialDetail(
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
        await reports.listCandidateWorkspace(
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
      return await reports.candidateFile(
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
        artifacts: await reports.listArtifacts(
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
        events: await reports.trajectory(
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
}

function registerDashboardAssets(app: Hono, dashboardRoot: string): void {
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
      headers: { 'content-type': fileContentType(servedFile) },
    });
  });
}

/** The npm package bundles the UI beside cli.mjs; the monorepo uses its Vite build. */
function dashboardAssets(): string {
  const bundledDashboard = new URL('./dashboard/', import.meta.url);
  const root = fileURLToPath(
    existsSync(bundledDashboard)
      ? bundledDashboard
      : new URL('../../dashboard/dist/', import.meta.url),
  );
  if (!existsSync(resolve(root, 'index.html')))
    throw new Error(
      `Dashboard assets not found at ${root}; run \`bun run build\` in the EvalKit repository`,
    );
  return root;
}

async function useProject(configPath: string | undefined): Promise<void> {
  project = await loadProject(projectRoot, configPath);
  projectRoot = project.root;
  reportRoot = resolve(
    projectRoot,
    project.config.reportDir ?? '_evalkit-results',
  );
}

async function serveDashboard(): Promise<void> {
  const registry = await loadRegistry();
  const dashboardRoot = dashboardAssets();
  const app = new Hono();
  const dashboardMatrix = project?.config.matrix
    ? registry.matrices.at(-1)
    : undefined;
  registerMatrixRoutes(
    app,
    registry,
    dashboardMatrix,
    project?.config.execution?.trials,
  );
  registerReportRoutes(
    app,
    registry,
    createDashboardReportReader(reportRoot, registry),
  );
  registerDashboardAssets(app, dashboardRoot);
  const port = Number(process.env.PORT ?? 4317);
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({ port, fetch: app.fetch });
  } catch (error) {
    if ((error as { code?: string }).code === 'EADDRINUSE')
      throw new Error(
        `Port ${port} is already in use. Stop the other server or choose another port: PORT=4318 evalkit dev`,
      );
    throw error;
  }
  const url = `http://localhost:${server.port}`;
  const reader = createDashboardReportReader(reportRoot, registry);
  const runs = (await reader.listRuns()).length;
  const legacy = reader.legacyRunIds().length;
  const matrixCells = dashboardMatrix?.count({ parameters: {} });
  const row = (label: string, value: string) =>
    console.log(`  ${cyan('➜')}  ${bold(label.padEnd(9))}${value}`);
  banner('dev', VERSION);
  printLoadErrors(project?.loadErrors ?? []);
  row('Local:', cyan(url));
  row(
    'Project:',
    `${plural(registry.evals.length, 'eval')} · ${plural(registry.suites.length, 'suite')}` +
      (dashboardMatrix
        ? ` · matrix ${authoringId(dashboardMatrix)} (${plural(matrixCells!, 'cell')})`
        : ''),
  );
  row(
    'Reports:',
    `${relative(process.cwd(), reportRoot) || '.'} ${dim(`(${plural(runs, 'run')}${legacy ? `, ${legacy} from an older EvalKit hidden` : ''})`)}`,
  );
  console.log(
    `\n  ${dim('Runs started from the dashboard are logged below. Press Ctrl+C to stop.')}\n`,
  );
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

/* The command tree and its option/argument parsing are owned by @effect/cli. */
const config = Options.text('config').pipe(Options.optional);
const runOptions = {
  config,
  eval: Options.text('eval').pipe(Options.repeated),
  suite: Options.text('suite').pipe(Options.optional),
  matrix: Options.text('matrix').pipe(Options.optional),
  model: Options.text('model').pipe(Options.repeated),
  mode: Options.text('mode').pipe(Options.repeated),
  select: Options.text('select').pipe(Options.repeated),
  param: Options.text('param').pipe(Options.repeated),
  maxTokens: Options.text('max-tokens').pipe(Options.optional),
  chatTimeout: Options.text('chat-timeout-ms').pipe(Options.optional),
  turnBudget: Options.text('turn-budget').pipe(Options.optional),
  concurrency: Options.text('concurrency').pipe(Options.optional),
  trials: Options.text('trials').pipe(Options.optional),
  json: Options.boolean('json'),
  dryRun: Options.boolean('dry-run'),
  all: Options.boolean('all'),
  local: Options.boolean('local'),
  junit: Options.text('junit').pipe(Options.optional),
  verbose: Options.boolean('verbose'),
  skipBroken: Options.boolean('skip-broken'),
};
type RunOptions = {
  config: Option.Option<string>;
  eval: string[];
  suite: Option.Option<string>;
  matrix: Option.Option<string>;
  model: string[];
  mode: string[];
  select: string[];
  param: string[];
  maxTokens: Option.Option<string>;
  chatTimeout: Option.Option<string>;
  turnBudget: Option.Option<string>;
  concurrency: Option.Option<string>;
  trials: Option.Option<string>;
  json: boolean;
  dryRun: boolean;
  all: boolean;
  local: boolean;
  junit: Option.Option<string>;
  verbose: boolean;
  skipBroken: boolean;
};
function runInput(options: RunOptions, positionals: string[]) {
  const unexpected = positionals.find((value) => value.startsWith('-'));
  if (unexpected) throw new Error(`Unknown option: ${unexpected}`);
  return normalizeRunOptions(
    {
      config: Option.getOrUndefined(options.config),
      eval: options.eval,
      suite: Option.getOrUndefined(options.suite),
      matrix: Option.getOrUndefined(options.matrix),
      model: options.model,
      mode: options.mode,
      select: options.select,
      param: options.param,
      'max-tokens': Option.getOrUndefined(options.maxTokens),
      'chat-timeout-ms': Option.getOrUndefined(options.chatTimeout),
      'turn-budget': Option.getOrUndefined(options.turnBudget),
      concurrency: Option.getOrUndefined(options.concurrency),
      trials: Option.getOrUndefined(options.trials),
      json: options.json,
      'dry-run': options.dryRun,
      all: options.all,
      local: options.local,
      junit: Option.getOrUndefined(options.junit),
      verbose: options.verbose,
      'skip-broken': options.skipBroken,
    },
    positionals,
  );
}
const execute = (input: ReturnType<typeof normalizeRunOptions>) =>
  Effect.tryPromise({
    try: () => runProjectCommand([], process.cwd(), input),
    catch: (error) => error,
  });
const runCommand = Command.make(
  'run',
  {
    ...runOptions,
    evalIds: Args.text({ name: 'eval-id' }).pipe(Args.repeated),
  },
  ({ evalIds, ...options }) => execute(runInput(options, evalIds)),
);
const newCommand = Command.make(
  'new',
  {
    directory: Args.text({ name: 'directory' }),
  },
  ({ directory }) =>
    Effect.tryPromise({
      try: async () => {
        const root = await newProject([directory]);
        console.log(
          `Created EvalKit project at ${root}\nRun cd ${root} && bun install && bun run evalkit run.`,
        );
      },
      catch: (error) => error,
    }),
);
const devCommand = Command.make('dev', { config }, ({ config }) =>
  Effect.tryPromise({
    try: async () => {
      await useProject(Option.getOrUndefined(config));
      await serveDashboard();
    },
    catch: (error) => error,
  }),
);
const buildCommand = Command.make(
  'build',
  {
    config,
    out: Options.text('out').pipe(Options.optional),
    run: Options.boolean('run'),
    noRun: Options.boolean('no-run'),
  },
  ({ config, out, run, noRun }) =>
    Effect.tryPromise({
      try: async () => {
        if (run && noRun) throw new Error('Choose either --run or --no-run');
        const started = performance.now();
        const configPath = Option.getOrUndefined(config);
        banner('build', VERSION);
        await loadProjectStep(configPath);
        if (await shouldRunEvals({ run, noRun })) await runAllEvals(configPath);
        const result = await buildDashboard(
          {
            registry: project!.registry,
            reportRoot,
            dashboardRoot: dashboardAssets(),
            outDir: resolve(
              projectRoot,
              Option.getOrElse(out, () => '_evalkit-dashboard'),
            ),
          },
          step,
        );
        const size = await directorySize(result.outDir);
        const shown = relative(process.cwd(), result.outDir) || '.';
        console.log(
          `\n  ${bold(`${shown}/`)}  ${dim(`${bytes(size.bytes)} · ${plural(size.files, 'file')}`)}`,
        );
        console.log(
          `\n  ${bold('Built read-only dashboard')} in ${duration(performance.now() - started)}\n`,
        );
        console.log(`  ${cyan('➜')}  ${bold('Preview:')}  bunx serve ${shown}`);
        console.log(
          `  ${yellow('⚠')}  Contains transcripts, scores, evidence, and candidate files\n` +
            `     (never evaluator workspaces). Review before sharing.\n`,
        );
      },
      catch: (error) => error,
    }),
);

async function loadProjectStep(configPath: string | undefined): Promise<void> {
  await step(
    'Eval project',
    () => useProject(configPath),
    () => {
      const where = relative(process.cwd(), projectRoot);
      const broken = project!.loadErrors.length;
      return `${plural(project!.registry.evals.length, 'eval')} loaded${where ? ` from ${where}` : ''}${broken ? yellow(` · ${plural(broken, 'file')} failed to load`) : ''}`;
    },
  );
  if (project!.loadErrors.length) {
    console.log('');
    printLoadErrors(project!.loadErrors);
  }
}

/**
 * A snapshot needs data: with no current results, run the evals. Otherwise ask,
 * or keep the existing results when no one can answer (CI, pipes).
 */
async function shouldRunEvals(flags: {
  run: boolean;
  noRun: boolean;
}): Promise<boolean> {
  if (flags.run) return true;
  if (flags.noRun) return false;
  const runs = (
    await createDashboardReportReader(reportRoot, project!.registry).listRuns()
  ).filter((entry) => !entry.archived).length;
  if (!runs) {
    console.log(
      `  ${cyan('◇')} No results yet, so running the evals to have data to build.`,
    );
    return true;
  }
  if (!canPrompt()) {
    console.log(
      `  ${dim(`Using ${plural(runs, 'existing run')}; pass --run to run the evals first.`)}`,
    );
    return false;
  }
  return confirm(
    `Run the evals before building? ${dim(`(${plural(runs, 'existing run')})`)}`,
  );
}

async function runAllEvals(configPath: string | undefined): Promise<void> {
  const started = performance.now();
  console.log(`\n  ${cyan('▶')} ${bold('Running evals')}\n`);
  await runProjectCommand(
    [],
    process.cwd(),
    parseRunArgs(configPath ? ['--config', configPath] : []),
  );
  const failed = process.exitCode === 1;
  console.log(
    `\n  ${failed ? yellow('⚠') : cyan('✓')} ${bold('Evals finished')} in ${duration(performance.now() - started)}` +
      (failed ? dim(' (some failed; building with their results)') : '') +
      '\n',
  );
}

const tidyCommand = Command.make('tidy', { config }, ({ config }) =>
  Effect.tryPromise({
    try: async () => {
      banner('tidy', VERSION);
      await loadProjectStep(Option.getOrUndefined(config));
      const result = await step(
        'Run reports',
        () => tidyReports({ registry: project!.registry, reportRoot }),
        (value) =>
          `${plural(value.current + value.archived.length + value.stillArchived, 'run')} checked`,
      );
      const byEval = (entries: { evalId: string }[]) =>
        [
          ...entries
            .reduce(
              (groups, entry) =>
                groups.set(entry.evalId, (groups.get(entry.evalId) ?? 0) + 1),
              new Map<string, number>(),
            )
            .entries(),
        ]
          .map(
            ([id, total]) =>
              `    ${bold(id)} ${dim(`(${plural(total, 'run')})`)}`,
          )
          .join('\n');
      console.log('');
      if (result.archived.length)
        console.log(
          `  ${yellow('◆')} Archived ${plural(result.archived.length, 'run')} of evals no longer in the project:\n${byEval(result.archived)}`,
        );
      if (result.restored.length)
        console.log(
          `  ${cyan('◆')} Restored ${plural(result.restored.length, 'run')} whose eval is back:\n${byEval(result.restored)}`,
        );
      if (!result.archived.length && !result.restored.length)
        console.log(`  ${cyan('✓')} Nothing new to tidy.`);
      const totalArchived = result.archived.length + result.stillArchived;
      if (totalArchived)
        console.log(
          `\n  ${dim(`Archived runs (${totalArchived}) are hidden in \`evalkit dev\` (filter "Show archived")`)}\n` +
            `  ${dim('and left out of `evalkit build`. Nothing was deleted.')}`,
        );
      console.log('');
    },
    catch: (error) => error,
  }),
);
const shareServeCommand = Command.make(
  'serve',
  {
    dir: Options.text('dir').pipe(Options.withDefault('_evalkit-share')),
    port: Options.integer('port').pipe(Options.withDefault(4318)),
  },
  ({ dir, port }) =>
    Effect.tryPromise({
      try: async () => {
        const root = resolve(process.cwd(), dir);
        const app = await createDirectoryShareApp({
          dir: root,
          dashboardRoot: dashboardAssets(),
        });
        let server: ReturnType<typeof Bun.serve>;
        try {
          server = Bun.serve({ port, fetch: app.fetch });
        } catch (error) {
          if ((error as { code?: string }).code === 'EADDRINUSE')
            throw new Error(
              `Port ${port} is already in use. Choose another: evalkit share serve --port 4319`,
            );
          throw error;
        }
        banner('share serve', VERSION);
        console.log(
          `  ${cyan('➜')}  ${bold('Local:'.padEnd(9))}${cyan(`http://localhost:${server.port}`)}`,
        );
        console.log(
          `  ${cyan('➜')}  ${bold('Storage:'.padEnd(9))}${relative(process.cwd(), root) || '.'}`,
        );
        console.log(
          `\n  ${dim(`Upload with share.url = "http://localhost:${server.port}". No authentication: keep it private.`)}\n`,
        );
      },
      catch: (error) => error,
    }),
);

const shareCommand = Command.make(
  'share',
  {
    config,
    all: Options.boolean('all'),
    allowDirty: Options.boolean('allow-dirty'),
    noWorkspace: Options.boolean('no-workspace'),
  },
  ({ config, all, allowDirty, noWorkspace }) =>
    Effect.tryPromise({
      try: async () => {
        const started = performance.now();
        banner('share', VERSION);
        await loadProjectStep(Option.getOrUndefined(config));
        const serverUrl =
          process.env.EVALKIT_SHARE_URL ?? project!.config.share?.url;
        if (!serverUrl)
          throw new Error(
            'No share server configured. Set share: { url } in evalkit.config.ts or EVALKIT_SHARE_URL.',
          );
        const head = await step(
          'Source',
          () =>
            detectSource(projectRoot, {
              outputDirs: [
                reportRoot,
                sandboxRoot,
                resolve(projectRoot, '_evalkit-dashboard'),
              ],
            }),
          (source) =>
            source
              ? `${repoKey(source)} @ ${shortSource(source)}${source.ref ? ` (${source.ref})` : ''}`
              : 'not a git repository',
        );
        if (!head)
          throw new Error(
            'evalkit share needs to know the commit: run it inside a git repository or set EVALKIT_SOURCE_REPO and EVALKIT_SOURCE_COMMIT. `evalkit build` works without one.',
          );
        const registry = project!.registry;
        const selection = await step(
          'Runs',
          async () =>
            selectRuns(
              await createDashboardReportReader(
                reportRoot,
                registry,
              ).listRuns(),
              head,
              { all, allowDirty },
            ),
          (value) => selectionSummary(value, { all }),
        );
        if (!selection.selected.length)
          throw new Error(noRunsMessage(selection, head, { all }));
        const shareHeaders = await step(
          'Server',
          async () => {
            const headers = await resolveShareHeaders(
              project!.config.share?.headers,
            );
            await checkShareServer(serverUrl, headers);
            return headers;
          },
          (headers) => {
            const names = Object.keys(headers);
            return `${new URL(serverUrl).host}${names.length ? dim(` with ${names.join(', ')}`) : ''}`;
          },
        );
        const result = await shareRuns({
          serverUrl,
          headers: shareHeaders,
          reportRoot,
          registry,
          runs: selection.selected,
          workspaceFiles: !noWorkspace,
          step,
        });
        for (const failure of result.failed)
          console.log(
            `  ${yellow('✗')} ${failure.runId.slice(0, 8)} ${dim(failure.error)}`,
          );
        const target = shareTarget(serverUrl, head, selection.selected);
        console.log(
          `\n  ${bold(result.failed.length ? 'Shared with errors' : 'Shared')} in ${duration(performance.now() - started)}\n`,
        );
        console.log(`  ${cyan('➜')}  ${cyan(target)}\n`);
        if (result.failed.length) process.exitCode = 1;
      },
      catch: (error) => error,
    }),
).pipe(Command.withSubcommands([shareServeCommand]));

const compareCommand = Command.make(
  'compare',
  {
    config,
    base: Options.text('base').pipe(Options.optional),
    baseDir: Options.text('base-dir').pipe(Options.optional),
    markdown: Options.text('markdown').pipe(Options.optional),
    json: Options.boolean('json'),
    failOn: Options.text('fail-on').pipe(Options.repeated),
    requireBase: Options.boolean('require-base'),
    allowDirty: Options.boolean('allow-dirty'),
  },
  (options) =>
    Effect.tryPromise({
      try: () =>
        compareCommandAction({
          config: Option.getOrUndefined(options.config),
          base: Option.getOrUndefined(options.base),
          baseDir: Option.getOrUndefined(options.baseDir),
          markdown: Option.getOrUndefined(options.markdown),
          json: options.json,
          failOn: options.failOn,
          requireBase: options.requireBase,
          allowDirty: options.allowDirty,
        }),
      catch: (error) => error,
    }),
);

async function compareCommandAction(options: {
  config?: string;
  base?: string;
  baseDir?: string;
  markdown?: string;
  json: boolean;
  failOn: string[];
  requireBase: boolean;
  allowDirty: boolean;
}): Promise<void> {
  if (Boolean(options.base) === Boolean(options.baseDir))
    throw new Error('Give exactly one of --base <ref> or --base-dir <dir>');
  const conditions = parseFailOn(options.failOn);
  const say = options.json ? () => {} : (line = '') => console.log(line);
  if (!options.json) banner('compare', VERSION);
  await useProject(options.config);
  const registry = project!.registry;
  const head = await detectSource(projectRoot, {
    outputDirs: [
      reportRoot,
      sandboxRoot,
      resolve(projectRoot, '_evalkit-dashboard'),
    ],
  });
  if (!head)
    throw new Error(
      'evalkit compare needs to know the commit: run it inside a git repository or set EVALKIT_SOURCE_REPO and EVALKIT_SOURCE_COMMIT.',
    );
  const headSide = headRuns(
    await createDashboardReportReader(reportRoot, registry).listRuns(),
    head,
    { allowDirty: options.allowDirty },
  );
  let base: { label: string; runs: ComparedRun[] } | undefined;
  if (options.baseDir) {
    const runs = await baseRunsFromDirectory(
      resolve(process.cwd(), options.baseDir),
      registry,
    );
    base = runs.length ? { label: options.baseDir, runs } : undefined;
  } else {
    const serverUrl =
      process.env.EVALKIT_SHARE_URL ?? project!.config.share?.url;
    if (!serverUrl)
      throw new Error(
        'No share server configured for --base. Set share: { url } in evalkit.config.ts or EVALKIT_SHARE_URL, or use --base-dir.',
      );
    const found = await baseRunsFromServer({
      serverUrl,
      headers: await resolveShareHeaders(project!.config.share?.headers),
      head,
      ref: options.base!,
    });
    base = found?.runs.length
      ? {
          label: `${found.commit.slice(0, 7)}${found.ref ? ` (${found.ref})` : ''}`,
          runs: found.runs,
        }
      : undefined;
  }
  const headLabel = `${shortSource(head)}${head.ref ? ` (${head.ref})` : ''}`;
  if (!base) {
    const message = `No shared results for base ${options.base ?? options.baseDir}; nothing to compare.`;
    if (options.json)
      console.log(JSON.stringify({ base: null, head: headLabel, message }));
    else say(`  ${yellow('◇')} ${message}\n`);
    if (options.requireBase) process.exitCode = 1;
    return;
  }
  if (!headSide.length)
    throw new Error(
      `No results at ${headLabel} to compare. Run \`evalkit run\` first${head.dirty ? ', or pass --allow-dirty' : ''}.`,
    );
  const comparison = compareRuns(base.runs, headSide);
  const failures = gateFailures(comparison, conditions);
  if (options.markdown)
    await Bun.write(
      resolve(process.cwd(), options.markdown),
      comparisonMarkdown(comparison, { base: base.label, head: headLabel }),
    );
  if (options.json)
    console.log(
      JSON.stringify({
        base: base.label,
        head: headLabel,
        ...comparison,
        failures,
      }),
    );
  else {
    const lines = comparisonLines(comparison);
    say(`  base ${bold(base.label)} → head ${bold(headLabel)}\n`);
    const marks = {
      regressed: red('✗'),
      fixed: green('✓'),
      'not-comparable': yellow('◌'),
    };
    for (const { change, labels } of lines.units)
      say(
        `  ${marks[change as keyof typeof marks]} ${`${labels.length} ${change.replace('-', ' ')}`.padEnd(18)} ${labels.join(', ')}`,
      );
    say(`  ${dim(lines.counts)}`);
    const ignored = comparison.ignoredRuns.base + comparison.ignoredRuns.head;
    if (ignored)
      say(
        `  ${dim(`${plural(ignored, 'older run')} of the same scenarios ignored`)}`,
      );
    say('');
    for (const line of lines.suites) say(`  ${line}`);
    if (lines.datasets) say(`  ${lines.datasets}`);
    say('');
    for (const failure of failures) say(`  ${red('✗')} ${failure}`);
    if (options.markdown) say(`  ${dim(`Markdown: ${options.markdown}`)}`);
    if (failures.length || options.markdown) say('');
  }
  if (failures.length) process.exitCode = 1;
}

const app = Command.make('evalkit').pipe(
  Command.withSubcommands([
    newCommand,
    runCommand,
    devCommand,
    buildCommand,
    tidyCommand,
    shareCommand,
    compareCommand,
  ]),
);
const cli = Command.run(app, { name: 'EvalKit', version: VERSION });
const argv = process.argv.slice();
if (argv[2] === 'help') argv.splice(2, 1, '--help');
// Preserve the CLI's existing help spelling while letting @effect/cli render it.
if (argv.at(-2) === '--' && argv.at(-1) === '--help') argv.splice(-2, 1);
try {
  await Effect.runPromise(cli(argv).pipe(Effect.provide(NodeContext.layer)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
