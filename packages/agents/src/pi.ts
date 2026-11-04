import { randomUUID } from 'node:crypto';
import type { AutAdapter } from '@evalkit/core';
import pi from '@leostera/atxf/pi';
import {
  harnessAgent,
  joinPath,
  quoteWord,
  type HarnessOptions,
} from './harness.js';

export type PiOptions = HarnessOptions & {
  /** False runs Pi without tools (`--no-tools`), such as for a judge. */
  tools?: boolean;
  /** Skill files or directories to load (`--skill`), as paths commands see. */
  skills?: readonly string[];
  /** Text appended to Pi's system prompt (`--append-system-prompt`). */
  appendSystemPrompt?: string;
};

/**
 * Pi (https://pi.dev) as the agent under test: `pi --print` with its own
 * tools, system prompt and context handling, one session per run. Its
 * session file becomes the run's transcript.
 */
export function piAgent(options: PiOptions = {}): AutAdapter {
  return harnessAgent(
    {
      id: 'pi',
      name: 'Pi',
      command: 'pi',
      configEnv: (configDir) => ({ PI_CODING_AGENT_DIR: configDir }),
      newSession: () => randomUUID(),
      argv: (turn) => [
        turn.command,
        '--print',
        '--session-dir',
        joinPath(turn.stateDir, 'sessions'),
        '--session-id',
        turn.session ?? '',
        ...(turn.configDir
          ? // Nothing from the person's setup: what the run gives Pi is all it has.
            [
              '--no-extensions',
              '--no-skills',
              '--no-prompt-templates',
              '--no-themes',
            ]
          : []),
        ...(options.tools === false ? ['--no-tools'] : []),
        ...(turn.model ? ['--model', turn.model] : []),
        ...(options.skills ?? []).flatMap((skill) => ['--skill', skill]),
        ...(options.appendSystemPrompt
          ? ['--append-system-prompt', options.appendSystemPrompt]
          : []),
      ],
      saveSession: ({ stateDir, session, target }) => [
        'sh',
        '-c',
        `cp ${quoteWord(joinPath(stateDir, 'sessions'))}/*_${session}.jsonl ${quoteWord(target)}`,
      ],
      toAtxf: (text) => pi.toAtxf(text),
    },
    options,
  );
}
