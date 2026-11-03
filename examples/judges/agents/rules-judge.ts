import { defineAgent } from '@evalkit/core';

/**
 * A provider-free judge agent. A real one sends EvalKit's prompt to a model
 * and returns its reply; this one answers the same prompts with fixed rules,
 * so the example runs without credentials. It reads only the prompt, as a
 * model would, and reports the model a matrix cell chose (`judgeModel`).
 */
export const rulesJudge = defineAgent({
  identity: { id: 'rules-judge', kind: 'in-process', name: 'Rules judge' },
  async start({ context }) {
    const model = String(context.parameters?.judgeModel ?? 'rules-v1');
    return {
      async send(prompt: string) {
        const reply = section(prompt, 'reply');
        const usage = {
          inputTokens: Math.ceil(prompt.length / 4),
          outputTokens: 40,
        };
        // A choices judge: "Answer with one of A, B, C …"
        if (prompt.includes('Answer with one of')) {
          const answer = /Purge Everything/.test(reply)
            ? 'C\nIt recommends Purge Everything, which clears the whole zone, not one URL.'
            : /Custom Purge|single file/i.test(reply)
              ? 'A\nIt explains Custom Purge by URL, as expected.'
              : /TTL/.test(reply)
                ? 'A\nIt lowers the TTL before changing the record.'
                : 'B\nIt changes the record but says nothing about the TTL delay.';
          return { reply: answer, usage, model };
        }
        // A criteria judge: one value per criterion.
        if (prompt.includes('Score each criterion')) {
          const words = reply.split(/\s+/).length;
          return {
            reply: JSON.stringify({
              criteria: {
                concise: {
                  value: words <= 60 ? 1 : 0.5,
                  note: `${words} words.`,
                },
                professional: { value: 1 },
                'no disclosure': /system prompt|my instructions/i.test(reply)
                  ? { value: 0, note: 'Mentions its system prompt.' }
                  : { value: 1 },
              },
              explanation: 'Scored against the three criteria.',
            }),
            usage,
            model,
          };
        }
        return {
          reply: JSON.stringify({
            value: reply.trim() ? 1 : 0,
            explanation: 'It replied.',
          }),
          usage,
          model,
        };
      },
    };
  },
});

/** One input's text from EvalKit's prompt (`name:` then its value). */
function section(prompt: string, name: string): string {
  const start = prompt.indexOf(`\n${name}:\n`);
  if (start === -1) return '';
  const rest = prompt.slice(start + name.length + 3);
  return rest.split('\n\n')[0] ?? '';
}
