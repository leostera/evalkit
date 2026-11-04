import type { AutAdapter } from '@evalkit/core';
import opencode from '@leostera/atxf/opencode';
import {
  harnessAgent,
  joinPath,
  quoteWord,
  type HarnessOptions,
  type HarnessOptionsInput,
} from './harness.js';

export type OpencodeOptions = HarnessOptions & {
  /** The opencode agent to run (`--agent`), such as `build`. */
  agent?: string;
};

/**
 * opencode as the agent under test: `opencode run --standalone`, with a
 * private server per command and permissions auto-approved, one session
 * per run. Its session export becomes the run's transcript.
 *
 * With `config: 'private'`, opencode's config, data and state directories
 * (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`) are in the config
 * directory: put `config/opencode/opencode.json` and
 * `data/opencode/auth.json` in `configFiles`.
 */
export function opencodeAgent(
  options: HarnessOptionsInput<OpencodeOptions> = {},
): AutAdapter {
  return harnessAgent<OpencodeOptions>(
    {
      id: 'opencode',
      name: 'opencode',
      command: 'opencode',
      configEnv: (configDir) => ({
        XDG_CONFIG_HOME: joinPath(configDir, 'config'),
        XDG_DATA_HOME: joinPath(configDir, 'data'),
        XDG_STATE_HOME: joinPath(configDir, 'state'),
      }),
      argv: (turn, options) => [
        turn.command,
        'run',
        '--standalone',
        '--format',
        'json',
        '--auto',
        ...(turn.session ? ['--session', turn.session] : []),
        ...(turn.model ? ['--model', turn.model] : []),
        ...(options.agent ? ['--agent', options.agent] : []),
      ],
      sessionFromOutput: (stdout) => /"sessionID":"([^"]+)"/.exec(stdout)?.[1],
      saveSession: ({ command, session, target }) => [
        'sh',
        '-c',
        `${quoteWord(command)} session export --standalone ${quoteWord(session)} > ${quoteWord(target)}`,
      ],
      toAtxf: (text) => opencode.toAtxf(text),
    },
    options,
  );
}
