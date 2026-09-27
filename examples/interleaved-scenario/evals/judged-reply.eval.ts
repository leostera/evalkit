import { defineAgent, defineEval, judge, user } from '@evalkit/core';
import { fileAgent } from '../agents/file-agent.js';

// A provider-free fake judge agent. In a real eval, this can be a no-tools model
// agent or a custom agent with evaluator-side tools, independently from the AUT.
const localJudge = defineAgent({
  identity: { id: 'local-fake-judge', kind: 'in-process' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ onEvent }) {
    return {
      async send(message: string) {
        const request = JSON.parse(message) as {
          rubric: string;
          placement: 'transcript' | 'scoring';
          evidence: {
            turn?: Array<{ kind: string; content?: unknown }>;
            trajectory?: Array<{ kind: string; content?: unknown }>;
          };
        };
        const events =
          request.placement === 'transcript'
            ? request.evidence.turn
            : request.evidence.trajectory;
        const passed =
          events?.some(
            (event) =>
              event.kind === 'message' &&
              typeof event.content === 'string' &&
              event.content.includes('2112'),
          ) ?? false;
        await onEvent({
          kind: 'message',
          role: 'assistant',
          content: JSON.stringify({
            value: Number(passed),
            explanation: passed
              ? `Satisfied: ${request.rubric}`
              : `Not satisfied: ${request.rubric}`,
            evidence: { placement: request.placement },
          }),
          timestamp: new Date().toISOString(),
        });
        await onEvent({
          kind: 'turn-completed',
          turn: 1,
          usage: { inputTokens: 7, outputTokens: 3 },
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

const replyQuality = judge('reply quality', {
  rubric: 'Did the assistant describe writing 2112?',
});

export default defineEval({
  id: 'judged-reply',
  agent: fileAgent(),
  judge: localJudge,
  transcript: [user('Write 2112 into number.txt.'), replyQuality],
  scoring: [replyQuality], // exactly the same rule is evaluated after session close
});
