/**
 * The EvalKit command line: every command, flag and help text in one place.
 * Actions live elsewhere; this file only turns argv into their typed inputs.
 */
import { Command, InvalidArgumentError, Option } from 'commander';
import { normalizeRunOptions, type RunInput } from './run-command.js';
import {
  LOG_LEVELS,
  setRunnerLogLevel,
  type RunnerLogLevel,
} from './terminal.js';
import { VERSION } from './version.js';

export type Actions = {
  create(directory: string): Promise<void>;
  run(input: RunInput): Promise<void>;
  dev(options: {
    config?: string;
    port?: number;
    open: boolean;
  }): Promise<void>;
  build(options: {
    config?: string;
    out?: string;
    run?: boolean;
  }): Promise<void>;
  tidy(options: { config?: string }): Promise<void>;
  share(options: {
    config?: string;
    server?: string;
    all: boolean;
    allowDirty: boolean;
    workspace: boolean;
  }): Promise<void>;
  shareServe(options: { dir: string; port?: number }): Promise<void>;
  compare(options: {
    config?: string;
    server?: string;
    base?: string;
    baseDir?: string;
    markdown?: string;
    json: boolean;
    failOn: string[];
    requireBase: boolean;
    allowDirty: boolean;
  }): Promise<void>;
};

/** Repeatable options; no default, so help doesn't print `(default: [])`. */
const collect = (value: string, previous: string[] | undefined) => [
  ...(previous ?? []),
  value,
];

function portNumber(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new InvalidArgumentError('Expected a port number (1–65535).');
  return port;
}

const configOption = () =>
  new Option(
    '-c, --config <file>',
    'use this config; its directory is the project root',
  );
const logLevelOption = () =>
  new Option('--log-level <level>', 'show runner logs at this level and above')
    .choices(LOG_LEVELS)
    .default('warning');
const portOption = (fallback: number) =>
  new Option(
    '-p, --port <port>',
    `serve on exactly this port (default: ${fallback}, or the next free one)`,
  ).argParser(portNumber);

const examples = (lines: string[]) =>
  `\nExamples:\n${lines.map((line) => `  $ ${line}`).join('\n')}\n`;

export function createProgram(actions: Actions): Command {
  const program = new Command('evalkit')
    .description(
      'Evaluate AI agents against scenarios, and inspect the results.',
    )
    .version(VERSION, '--version', 'print the EvalKit version')
    .helpOption('-h, --help', 'show help')
    .helpCommand('help [command]', 'show help for a command')
    .showSuggestionAfterError()
    .configureHelp({ sortSubcommands: false, showGlobalOptions: false })
    .addHelpText(
      'after',
      `\nRun from your eval project's directory. Docs: https://evalkit.leostera.dev/docs/\n`,
    );

  program
    .command('new')
    .description('create an eval project (never overwrites files)')
    .argument(
      '<directory>',
      'where to create it; use . for the current directory',
    )
    .addHelpText(
      'after',
      examples(['bunx @leostera/evalkit new ./agent-evals', 'evalkit new .']),
    )
    .action((directory: string) => actions.create(directory));

  program
    .command('run')
    .description('run scenarios and save the results in _evalkit-results/')
    .argument('[eval-ids...]', 'scenarios to run (default: all)')
    .addOption(configOption())
    .option(
      '-e, --eval <id>',
      'run this scenario; repeatable, or comma-separated',
      collect,
    )
    .option('-s, --suite <id>', 'run every scenario in this suite')
    .option('-m, --matrix <id>', 'run this matrix')
    .option(
      '--model <value>',
      'select values of the model axis; repeatable, or comma-separated',
      collect,
    )
    .option(
      '--mode <value>',
      'select values of the mode axis; repeatable, or comma-separated',
      collect,
    )
    .option(
      '--select <axis=value>',
      'select a value of any matrix axis; repeatable',
      collect,
    )
    .option(
      '--param <name=json>',
      'set a parameter for every scenario; repeatable',
      collect,
    )
    .option(
      '-n, --trials <n>',
      'trials per scenario, overriding config and policy',
    )
    .option('-j, --concurrency <n>', 'matrix cells to run at once (default: 4)')
    .option(
      '--max-tokens <n>',
      'pass maxTokens to the agent in context.parameters',
    )
    .option(
      '--turn-budget <n>',
      'pass turnBudget to the agent in context.parameters',
    )
    .option(
      '--chat-timeout-ms <n>',
      'pass chatTimeoutMs to the agent in context.parameters',
    )
    .option('--local', "require the agent's local runtime")
    .option('--all', 'allow more matrix cells than execution.maxCells')
    .option('--dry-run', 'print the plan as JSON; run nothing')
    .option('--json', 'print one JSON result per matrix cell')
    .option('--junit <file>', 'write a JUnit XML report')
    .option(
      '--skip-broken',
      'run healthy scenarios when some files fail to load, then exit 1',
    )
    .option('-v, --verbose', 'print every scenario, not only failures')
    .addOption(logLevelOption())
    .addHelpText(
      'after',
      examples([
        'evalkit run',
        'evalkit run greeting -n 5',
        'evalkit run -s billing --junit _evalkit-results/junit.xml',
        'evalkit run -m models --model model-a,model-b --dry-run',
      ]),
    )
    .action((evalIds: string[], options: RunFlags) => {
      setRunnerLogLevel(options.logLevel);
      return actions.run(runInput(evalIds, options));
    });

  program
    .command('dev')
    .description('open the dashboard on this project and its results')
    .addOption(configOption())
    .addOption(portOption(4317))
    .option('--no-open', "don't open a browser")
    .addOption(logLevelOption())
    .addHelpText(
      'after',
      examples(['evalkit dev', 'evalkit dev -p 4400 --no-open']),
    )
    .action(
      (options: {
        config?: string;
        port?: number;
        open: boolean;
        logLevel: RunnerLogLevel;
      }) => {
        setRunnerLogLevel(options.logLevel);
        return actions.dev(options);
      },
    );

  program
    .command('build')
    .description('write a static, read-only dashboard to _evalkit-dashboard/')
    .addOption(configOption())
    .option('-o, --out <dir>', 'write it here instead')
    .option('--run', 'run the scenarios first, without asking')
    .option('--no-run', 'use the existing results, without asking')
    .addOption(logLevelOption())
    .addHelpText(
      'after',
      examples(['evalkit build', 'evalkit build --no-run -o site']),
    )
    .action(
      (options: {
        config?: string;
        out?: string;
        run?: boolean;
        logLevel: RunnerLogLevel;
      }) => {
        setRunnerLogLevel(options.logLevel);
        return actions.build(options);
      },
    );

  program
    .command('tidy')
    .description(
      'archive runs of scenarios no longer in the project, and remove sandboxes keepSandboxes would not keep',
    )
    .addOption(configOption())
    .action((options: { config?: string }) => actions.tidy(options));

  const share = program
    .command('share')
    .description("upload this commit's results to a share server")
    .addOption(configOption())
    .option(
      '--server <url>',
      'share server to use instead of share.url in the config',
    )
    .option('--all', 'also upload runs from other commits')
    .option('--allow-dirty', 'include runs made with uncommitted changes')
    .option('--no-workspace', 'leave out candidate file contents')
    .addHelpText(
      'after',
      examples([
        'evalkit share',
        'evalkit share --server https://evals.example.com',
      ]),
    )
    .action(
      (options: {
        config?: string;
        server?: string;
        all?: boolean;
        allowDirty?: boolean;
        workspace: boolean;
      }) =>
        actions.share({
          ...options,
          all: Boolean(options.all),
          allowDirty: Boolean(options.allowDirty),
        }),
    );
  share
    .command('serve')
    .description('run a share server locally, with no authentication')
    .option('-d, --dir <dir>', 'where to store uploads', '_evalkit-share')
    .addOption(portOption(4318))
    .action((options: { dir: string; port?: number }) =>
      actions.shareServe(options),
    );

  program
    .command('compare')
    .description("compare this commit's results with a base commit's")
    .addOption(configOption())
    .option(
      '-b, --base <ref>',
      'base branch, tag or commit, from the share server',
    )
    .option('--base-dir <dir>', 'base results from a directory instead')
    .option(
      '--server <url>',
      'share server to use instead of share.url in the config',
    )
    .option(
      '--fail-on <condition>',
      'exit 1 on regression, or score-drop=<amount>; repeatable',
      collect,
    )
    .option('--markdown <file>', 'write the comparison as Markdown')
    .option('--json', 'print the comparison as JSON')
    .option('--require-base', 'exit 1 when the base has no results')
    .option('--allow-dirty', 'include runs made with uncommitted changes')
    .addHelpText(
      'after',
      examples([
        'evalkit compare -b main',
        'evalkit compare -b main --fail-on regression --markdown compare.md',
      ]),
    )
    .action(
      (options: {
        config?: string;
        server?: string;
        base?: string;
        baseDir?: string;
        markdown?: string;
        json?: boolean;
        failOn?: string[];
        requireBase?: boolean;
        allowDirty?: boolean;
      }) =>
        actions.compare({
          ...options,
          failOn: options.failOn ?? [],
          json: Boolean(options.json),
          requireBase: Boolean(options.requireBase),
          allowDirty: Boolean(options.allowDirty),
        }),
    );

  return program;
}

type RunFlags = {
  config?: string;
  eval?: string[];
  suite?: string;
  matrix?: string;
  model?: string[];
  mode?: string[];
  select?: string[];
  param?: string[];
  trials?: string;
  concurrency?: string;
  maxTokens?: string;
  turnBudget?: string;
  chatTimeoutMs?: string;
  local?: boolean;
  all?: boolean;
  dryRun?: boolean;
  json?: boolean;
  junit?: string;
  skipBroken?: boolean;
  verbose?: boolean;
  logLevel: RunnerLogLevel;
};

function runInput(evalIds: string[], flags: RunFlags): RunInput {
  return normalizeRunOptions(
    {
      config: flags.config,
      eval: flags.eval,
      suite: flags.suite,
      matrix: flags.matrix,
      model: flags.model,
      mode: flags.mode,
      select: flags.select,
      param: flags.param,
      'max-tokens': flags.maxTokens,
      'chat-timeout-ms': flags.chatTimeoutMs,
      'turn-budget': flags.turnBudget,
      concurrency: flags.concurrency,
      trials: flags.trials,
      json: flags.json,
      'dry-run': flags.dryRun,
      all: flags.all,
      local: flags.local,
      junit: flags.junit,
      verbose: flags.verbose,
      'skip-broken': flags.skipBroken,
    },
    evalIds,
  );
}
