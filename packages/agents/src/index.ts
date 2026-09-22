import { defineAgent, type AutAdapter } from '@evalkit/core';

export type AgentsSdkAutOptions = {
  endpoint: string;
  agent: string;
  getToken?: () => Promise<string | undefined> | string | undefined;
  instanceName?: (context: { runId: string; trialId: string }) => string;
};

/** Deferred remote Agents SDK transport. */
export function agentsSdk(_options: AgentsSdkAutOptions): AutAdapter {
  throw new Error('Agents SDK transport is not implemented yet');
}

export type PiAutOptions = {
  command?: string;
  /** Additional non-secret Pi arguments, such as an explicit model selection. */
  args?: string[];
};

/** A local, one-prompt-per-turn AUT backed by Pi's non-interactive print mode. */
export function piAgent(options: PiAutOptions = {}): AutAdapter {
  const command = options.command ?? 'pi';
  return defineAgent({
    identity: { kind: 'process', id: 'pi' },
    runtimes: { local: { kind: 'process', configuration: { command } } },
    async start({ context, onEvent }) {
      await onEvent({ kind: 'started', timestamp: new Date().toISOString() });
      let turn = 0;
      return {
        async send(message: string) {
          turn += 1;
          await onEvent({
            kind: 'turn-started',
            turn,
            timestamp: new Date().toISOString(),
          });
          const process = Bun.spawn(
            [
              command,
              '--print',
              '--no-session',
              '--no-tools',
              ...(options.args ?? []),
              message,
            ],
            { cwd: context.workspace.root, stdout: 'pipe', stderr: 'pipe' },
          );
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(process.stdout).text(),
            new Response(process.stderr).text(),
            process.exited,
          ]);
          if (exitCode !== 0)
            throw new Error(`Pi exited with ${exitCode}: ${stderr.trim()}`);
          await onEvent({
            kind: 'message',
            role: 'assistant',
            content: stdout.trim(),
            timestamp: new Date().toISOString(),
          });
          await onEvent({
            kind: 'turn-completed',
            turn,
            timestamp: new Date().toISOString(),
          });
        },
        async close() {
          await onEvent({
            kind: 'completed',
            timestamp: new Date().toISOString(),
          });
        },
      };
    },
  });
}
