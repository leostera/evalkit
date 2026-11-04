import {
  defineAgent,
  type AutAdapter,
  type AutContext,
  type JsonObject,
  type Shell,
} from '@evalkit/core';
import type { Transcript } from '@leostera/atxf';

/** Options every coding-agent harness takes. */
export type HarnessOptions = {
  /** The CLI to run; defaults to the harness's own name (`pi`, `codex`, …). */
  command?: string;
  /**
   * The model, in the CLI's own syntax (`--model`), or a function of the
   * run's parameters for a matrix: `({ model }) => String(model)`.
   */
  model?: string | ((parameters: JsonObject) => string | undefined);
  /** More arguments for every turn, after EvalKit's own. */
  args?: readonly string[];
  /** Environment variables for the CLI, such as an API key or proxy settings. */
  env?: Readonly<Record<string, string>>;
  /**
   * Which config the CLI reads. `'private'` (the default) points it at a
   * new, empty config directory in the run's private home, so the person's
   * extensions, skills, instructions and logins never reach the agent and
   * every run starts the same; give it what it needs with `configFiles`
   * and `env`. `'user'` uses the person's own config, which a container
   * or remote sandbox does not have unless it mounts or copies it in.
   */
  config?: 'private' | 'user';
  /**
   * Files to write into the private config directory before the first
   * turn, by path relative to it (`'auth.json'`), such as a provider's
   * settings. The agent can read them, so prefer credentials it cannot
   * use elsewhere, or a proxy that adds them.
   */
  configFiles?: Readonly<Record<string, string | Uint8Array>>;
};

/** One turn's command line. */
export type HarnessTurn = {
  /** The CLI, as configured. */
  command: string;
  /** The model for this run, if one was chosen. */
  model: string | undefined;
  /** The private config directory, or undefined with `config: 'user'`. */
  configDir: string | undefined;
  /** The run's directory for this harness's own files, as commands see it. */
  stateDir: string;
  /** The session to continue, or undefined on the first turn when the CLI picks it. */
  session: string | undefined;
  first: boolean;
};

/**
 * A harness's options, or a function that picks them for each run from
 * its context: a matrix cell's skills, config files or environment.
 */
export type HarnessOptionsInput<O extends HarnessOptions> =
  O | ((context: AutContext) => O);

/** What a harness needs to say about its CLI. */
export type HarnessSpec<O extends HarnessOptions = HarnessOptions> = {
  id: string;
  name: string;
  command: string;
  /** Environment variables that point the CLI at a private config directory. */
  configEnv(configDir: string): Record<string, string>;
  /** A session ID to start with, for CLIs that take one. */
  newSession?(): string;
  /** The command for one turn, starting with `turn.command`; the message goes on stdin. */
  argv(turn: HarnessTurn, options: O): string[];
  /** The session ID the CLI printed, for CLIs that pick their own. */
  sessionFromOutput?(stdout: string): string | undefined;
  /**
   * A shell command that copies the session's native record to `target`;
   * it runs where the CLI ran, with the same environment.
   */
  saveSession(
    options: HarnessTurn & { session: string; target: string },
  ): string[];
  /** The native record as an ATXF transcript. */
  toAtxf(text: string): Transcript;
};

/**
 * An adapter that runs a coding-agent CLI through `context.shell`, one
 * non-interactive invocation per user message, continuing one session.
 * After each turn it imports the CLI's own session record through ATXF,
 * so the run's transcript has every message, tool call and token count.
 */
export function harnessAgent<O extends HarnessOptions>(
  spec: HarnessSpec<O>,
  input: HarnessOptionsInput<O>,
): AutAdapter {
  return defineAgent({
    identity: { name: spec.name, kind: 'process', id: spec.id },
    async start({ context, transcript, attach }) {
      const options = typeof input === 'function' ? input(context) : input;
      const command = options.command ?? spec.command;
      const { shell } = context;
      const stateDir = joinPath(shell.home, spec.id);
      const configDir =
        (options.config ?? 'private') === 'private'
          ? joinPath(stateDir, 'config')
          : undefined;
      // The harness's directory, where its session is copied after each turn.
      await shell.writeFile(joinPath(stateDir, '.evalkit'), '');
      if (configDir) {
        // A directory the CLI can fill; the files it was given, written once.
        await shell.writeFile(joinPath(configDir, '.evalkit'), '');
        for (const [file, content] of Object.entries(options.configFiles ?? {}))
          await shell.writeFile(joinPath(configDir, file), content);
      } else if (options.configFiles)
        throw new Error(
          `${spec.name}: configFiles needs config: 'private', which is the default`,
        );
      const env = {
        ...(configDir ? spec.configEnv(configDir) : {}),
        ...options.env,
      };
      const model =
        typeof options.model === 'function'
          ? options.model(context.parameters ?? {})
          : options.model;
      let session = spec.newSession?.();
      let turns = 0;
      const log: string[] = [];

      return {
        async send(message: string) {
          const turn: HarnessTurn = {
            command,
            model,
            configDir,
            stateDir,
            session,
            first: turns === 0,
          };
          turns += 1;
          const argv = [...spec.argv(turn, options), ...(options.args ?? [])];
          const result = await shell.exec(argv, { input: message, env });
          log.push(
            `$ ${argv.join(' ')}  # turn ${turns}, exit ${result.exitCode}`,
            result.stdout,
            result.stderr,
          );
          session ??= spec.sessionFromOutput?.(result.stdout);
          // Whatever the agent did before failing or being stopped is kept.
          const imported = session
            ? await importSession(shell, spec, { ...turn, session }, env).then(
                (transcript_) => {
                  transcript.import(transcript_);
                  return undefined;
                },
                (error: unknown) => error,
              )
            : new Error(`${spec.name} did not report its session`);
          if (result.exitCode !== 0 && !context.signal.aborted)
            throw new Error(
              `${spec.name} exited with ${result.exitCode}: ${tail(result.stderr || result.stdout)}`,
            );
          if (imported && !context.signal.aborted)
            throw new Error(
              `Could not read ${spec.name}'s session: ${imported instanceof Error ? imported.message : String(imported)}`,
            );
        },
        async close() {
          if (log.length) await attach(`logs/${spec.id}.log`, log.join('\n'));
        },
      };
    },
  });
}

async function importSession(
  shell: Shell,
  spec: HarnessSpec,
  turn: HarnessTurn & { session: string },
  env: Record<string, string>,
): Promise<Transcript> {
  const target = joinPath(turn.stateDir, 'session');
  // Copied into the home rather than printed: sessions outgrow command output.
  const saved = await shell.exec(spec.saveSession({ ...turn, target }), {
    env,
    // A run stopped by a limit still saves what its agent did.
    signal: new AbortController().signal,
    timeoutMs: 30_000,
  });
  if (saved.exitCode !== 0)
    throw new Error(
      tail(saved.stderr || saved.stdout) || `exit ${saved.exitCode}`,
    );
  return spec.toAtxf(await shell.readFile(target));
}

/** Joins shell paths, which are POSIX inside containers. */
export const joinPath = (...parts: string[]) =>
  parts.join('/').replace(/\/+/g, '/');

/** A shell-quoted word. */
export const quoteWord = (word: string) => `'${word.replace(/'/g, `'\\''`)}'`;

const tail = (text: string) => text.trim().slice(-2_000);
