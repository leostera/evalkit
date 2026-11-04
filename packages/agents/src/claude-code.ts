import { randomUUID } from 'node:crypto';
import type { AutAdapter } from '@evalkit/core';
import claudeCode from '@leostera/atxf/claude-code';
import {
  harnessAgent,
  quoteWord,
  type HarnessOptions,
  type HarnessOptionsInput,
} from './harness.js';

export type ClaudeCodeOptions = HarnessOptions & {
  /** Text appended to Claude Code's system prompt (`--append-system-prompt`). */
  appendSystemPrompt?: string;
};

/**
 * Claude Code as the agent under test: `claude -p` with every tool allowed
 * (EvalKit's isolation is the sandbox), one session per run. Its session
 * file becomes the run's transcript.
 */
export function claudeCodeAgent(
  options: HarnessOptionsInput<ClaudeCodeOptions> = {},
): AutAdapter {
  return harnessAgent<ClaudeCodeOptions>(
    {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      configEnv: (configDir) => ({ CLAUDE_CONFIG_DIR: configDir }),
      newSession: () => randomUUID(),
      argv: (turn, options) => [
        turn.command,
        '--print',
        '--output-format',
        'json',
        '--dangerously-skip-permissions',
        ...(turn.first
          ? ['--session-id', turn.session ?? '']
          : ['--resume', turn.session ?? '']),
        ...(turn.model ? ['--model', turn.model] : []),
        ...(options.appendSystemPrompt
          ? ['--append-system-prompt', options.appendSystemPrompt]
          : []),
      ],
      saveSession: ({ session, target }) => [
        'sh',
        '-c',
        `cp "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/${session}.jsonl ${quoteWord(target)}`,
      ],
      toAtxf: (text) => claudeCode.toAtxf(text),
    },
    options,
  );
}
