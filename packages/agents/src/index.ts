import { defineAgent, type AutAdapter } from '@evalkit/core';

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

export type PiAutOptions = {
  command?: string;
  /** Additional non-secret Pi arguments, such as an explicit model selection. */
  args?: string[];
};

/** A local, one-prompt-per-turn AUT backed by Pi's non-interactive print mode. */
export function piAgent(options: PiAutOptions = {}): AutAdapter {
  const command = options.command ?? 'pi';
  return defineAgent({
    identity: {
      name: 'Pi Agent',
      kind: 'process',
      id: 'pi-agent',
    },
    runtimes: { local: { kind: 'process', configuration: { command } } },
    async start({ context, transcript }) {
      return {
        async send(message: string) {
          const turnId = transcript.turn('start');
          const process = Bun.spawn(
            [
              command,
              '--print',
              '--no-session',
              '--no-tools',
              ...(options.args ?? []),
              message,
            ],
            {
              cwd: context.workspace.root,
              stdout: 'pipe',
              stderr: 'pipe',
              // A limit or cancellation stops Pi too.
              signal: context.signal,
            },
          );
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(process.stdout).text(),
            new Response(process.stderr).text(),
            process.exited,
          ]);
          if (exitCode !== 0) {
            transcript.turn('end', {
              turnId,
              outcome: 'failed',
              error: { message: stderr.trim() || `exit ${exitCode}` },
            });
            throw new Error(`Pi exited with ${exitCode}: ${stderr.trim()}`);
          }
          transcript.assistant({ content: stdout.trim() });
          transcript.turn('end', { turnId, outcome: 'succeeded' });
        },
      };
    },
  });
}
