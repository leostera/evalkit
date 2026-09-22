import { predicate } from '@evalkit/core';

/** Uses the locally configured Pi CLI as a binary pass/fail judge. */
export const piGreetingJudge = predicate(
  'pi judges the reply',
  async ({ trajectory }) => {
    const reply = trajectory.events.find(
      (event) =>
        event.source === 'aut' &&
        event.kind === 'message' &&
        event.role === 'assistant',
    );
    const process = Bun.spawn(
      [
        'pi',
        '--print',
        '--no-session',
        '--no-tools',
        `Reply only PASS or FAIL. Is this a helpful greeting?\n${reply?.kind === 'message' ? String(reply.content) : ''}`,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      process.exited,
    ]);
    return {
      value: exitCode === 0 && /\bPASS\b/i.test(stdout) ? 1 : 0,
      explanation: stdout.trim(),
    };
  },
);
