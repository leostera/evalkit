import type { AutAdapter } from '@evalkit/core';

export type AgentsSdkAutOptions = {
  /** The deployed or local Worker URL exposing the Agent route. */
  endpoint: string;
  /** Agents SDK class name, for example `SupportAgent`. */
  agent: string;
  /** Optional token resolver used by remote runs. */
  getToken?: () => Promise<string | undefined> | string | undefined;
  /** Creates an isolated instance name for each eval trial. */
  instanceName?: (context: { runId: string; trialId: string }) => string;
};

/**
 * Creates an AUT adapter for an Agents SDK agent.
 *
 * The remote transport is intentionally deferred until Evalkit's core runner
 * contract has been validated with eval-author-defined test agents.
 */
export function agentsSdk(_options: AgentsSdkAutOptions): AutAdapter {
  throw new Error('Agents SDK transport is not implemented yet');
}
