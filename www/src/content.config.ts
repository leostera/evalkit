import { defineCollection } from 'astro/content/config';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections: { docs: ReturnType<typeof defineCollection> } = {
  // Starlight uses this collection at the site root by default. Prefix entry IDs
  // so the Markdown stays in src/content/docs/ while URLs start at /docs/.
  docs: defineCollection({
    loader: docsLoader({
      generateId: ({ entry }) => {
        const path = entry.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
        return path ? `docs/${path}` : 'docs';
      },
    }),
    schema: docsSchema(),
  }),
};
