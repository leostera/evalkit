import type { AutAdapter } from '@evalkit/core';

export type AgentsSdkAutOptions = {
  endpoint: string;
  agent: string;
  getToken?: () => Promise<string | undefined> | string | undefined;
  /** One instance per run by default; a batch's runs can share one by its ID. */
  instanceName?: (context: {
    runId: string;
    batch?: { id: string; index: number; size: number };
  }) => string;
};

/** Deferred remote Agents SDK transport. */
export function agentsSdk(_options: AgentsSdkAutOptions): AutAdapter {
  throw new Error('Agents SDK transport is not implemented yet');
}

export {
  harnessAgent,
  type HarnessOptions,
  type HarnessSpec,
  type HarnessTurn,
} from './harness.js';
export { piAgent, type PiOptions } from './pi.js';
export { codexAgent, type CodexOptions } from './codex.js';
export { opencodeAgent, type OpencodeOptions } from './opencode.js';
export { claudeCodeAgent, type ClaudeCodeOptions } from './claude-code.js';
