import { defineAgent, defineEval, judge, user } from '@evalkit/core';
import { fileAgent } from '../agents/file-agent.js';

// A provider-free fake judge agent. A real one calls a model with the prompt
// EvalKit sends and returns its reply; it is a defineAgent() agent like any
// other, independent from the agent under test.
const localJudge = defineAgent({
  identity: { id: 'local-fake-judge', kind: 'in-process', name: 'Local judge' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context }) {
    return {
      async send(prompt: string) {
        // EvalKit's prompt holds the rubric, the conversation and the reply.
        const reply = prompt.split('\nreply:\n')[1] ?? '';
        const passed = reply.includes('2112');
        return {
          reply: JSON.stringify({
            value: Number(passed),
            explanation: passed
              ? 'The reply says it wrote 2112.'
              : 'The reply never mentions 2112.',
          }),
          usage: { inputTokens: prompt.length, outputTokens: 12 },
          // A matrix axis such as judgeModel can choose a real judge's model.
          model: String(context.parameters?.judgeModel ?? 'local-rules'),
        };
      },
    };
  },
});

const replyQuality = judge('reply quality', {
  description: 'The reply says it wrote 2112',
  agent: localJudge,
  rubric: 'Did the assistant describe writing 2112?',
});

export default defineEval({
  id: 'judged-reply',
  agent: fileAgent(),
  transcript: [user('Write 2112 into number.txt.'), replyQuality],
  scoring: [replyQuality], // exactly the same rule is evaluated after session close
});
