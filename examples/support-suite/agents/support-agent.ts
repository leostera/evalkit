import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent, type JsonObject } from '@evalkit/core';

type Article = { name: string; keywords: string[]; body: string };

/**
 * A provider-free support agent: it answers from the help-center dataset by
 * keyword overlap, and hands off to a person when no article matches.
 */
export const supportAgent = defineAgent({
  identity: { id: 'support-agent', kind: 'in-process', name: 'Support agent' },
  async start({ context }) {
    const articles = await readArticles(
      join(context.workspace.root, 'help-center'),
    );
    const name = customerName(context.data);
    const greeting =
      context.parameters?.tone === 'formal' ? `Dear ${name},` : `Hi ${name}!`;
    return {
      async send(message: string) {
        const article = bestMatch(articles, message);
        if (!article)
          return `${greeting} I could not find an answer, so I will connect you with a person.`;
        return {
          reply: `${greeting} ${article.body}`,
          toolCalls: [
            {
              name: 'read_article',
              arguments: { article: article.name },
              result: article.body,
            },
          ],
        };
      },
    };
  },
});

async function readArticles(directory: string): Promise<Article[]> {
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith('.md'),
  );
  return Promise.all(
    files.sort().map(async (file) => {
      const [header = '', ...rest] = (
        await readFile(join(directory, file), 'utf8')
      ).split('\n');
      return {
        name: file.replace(/\.md$/, ''),
        keywords: header
          .replace(/^keywords:/, '')
          .trim()
          .split(/\s+/),
        body: rest.join(' ').trim(),
      };
    }),
  );
}

function bestMatch(articles: Article[], message: string): Article | undefined {
  const words = new Set(message.toLowerCase().match(/[a-z0-9-]+/g) ?? []);
  let best: { article: Article; score: number } | undefined;
  for (const article of articles) {
    const score = article.keywords.filter((word) => words.has(word)).length;
    if (score > (best?.score ?? 0)) best = { article, score };
  }
  return best?.article;
}

function customerName(data: JsonObject): string {
  const customer = data.customers;
  if (
    typeof customer === 'object' &&
    customer !== null &&
    !Array.isArray(customer) &&
    typeof customer.name === 'string'
  )
    return customer.name;
  throw new Error('The customers dataset gives each trial a customer');
}
