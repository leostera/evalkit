import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// All pages are prerendered. Cloudflare serves dist/ as Workers Static Assets;
// no server adapter, Worker script, or runtime bindings are needed.
export default defineConfig({
  site: 'https://evalkit.leostera.dev',
  output: 'static',
  integrations: [
    starlight({
      title: 'Evalkit',
      description: 'Write agent evals as code and inspect their results.',
      favicon: '/favicon.svg',
      disable404Route: true,
      editLink: {
        baseUrl: 'https://github.com/leostera/evalkit/edit/main/www/',
      },
      customCss: ['./src/styles/starlight.css'],
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'text/plain',
            title: 'LLM guide',
            href: '/llms.txt',
          },
        },
        {
          tag: 'script',
          content: `try {
        if (localStorage.getItem('starlight-theme') === null) localStorage.setItem('starlight-theme', 'light');
      } catch { /* Storage may be unavailable. */ }`,
        },
      ],
      components: { Footer: './src/components/DocsFooter.astro' },
      sidebar: [
        { label: 'Get started', link: '/docs/' },
        {
          label: 'Manual',
          items: [
            { label: 'Overview', link: '/docs/manual/' },
            {
              label: 'Project structure & discovery',
              link: '/docs/manual/project-structure/',
            },
            { label: 'Agents under test', link: '/docs/manual/agents/' },
            { label: 'Fixtures', link: '/docs/manual/fixtures/' },
            {
              label: 'Scorers & evals',
              link: '/docs/manual/scoring-and-evals/',
            },
            { label: 'CLI & matrices', link: '/docs/manual/cli-and-matrices/' },
            { label: 'Results & reports', link: '/docs/manual/results/' },
            { label: 'Troubleshooting', link: '/docs/manual/troubleshooting/' },
          ],
        },
      ],
    }),
  ],
});
