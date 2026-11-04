import type { AutAdapter } from '@evalkit/core';
import codex from '@leostera/atxf/codex';
import {
  harnessAgent,
  quoteWord,
  type HarnessOptions,
  type HarnessOptionsInput,
} from './harness.js';

export type CodexOptions = HarnessOptions;

/**
 * Codex as the agent under test: `codex exec` with approvals and its own
 * sandbox off (the run's EvalKit sandbox is the boundary), one session per
 * run. Its rollout file becomes the
 * run's transcript.
 */
export function codexAgent(
  options: HarnessOptionsInput<CodexOptions> = {},
): AutAdapter {
  return harnessAgent<CodexOptions>(
    {
      id: 'codex',
      name: 'Codex',
      command: 'codex',
      configEnv: (configDir) => ({ CODEX_HOME: configDir }),
      argv: (turn) => [
        turn.command,
        'exec',
        ...(turn.session ? ['resume', turn.session] : []),
        '--json',
        '--skip-git-repo-check',
        '--dangerously-bypass-approvals-and-sandbox',
        ...(turn.model ? ['--model', turn.model] : []),
        // The message is read from stdin.
        '-',
      ],
      sessionFromOutput: (stdout) => {
        for (const line of stdout.split('\n')) {
          const event = parseLine(line);
          if (
            event?.type === 'thread.started' &&
            typeof event.thread_id === 'string'
          )
            return event.thread_id;
        }
        return undefined;
      },
      saveSession: ({ session, target }) => [
        'sh',
        '-c',
        `cp "\${CODEX_HOME:-$HOME/.codex}"/sessions/*/*/*/rollout-*-${session}.jsonl ${quoteWord(target)}`,
      ],
      toAtxf: (text) => codex.toAtxf(text),
    },
    options,
  );
}

function parseLine(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
