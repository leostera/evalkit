import { Marked, marked, type Tokens } from 'marked';
import { codeToHtml } from 'shiki';
import source from '../content/manual.md?raw';

const sourceBase =
  'https://github.com/leostera/evalkit/blob/main/www/src/content/';

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

// The Markdown is trusted, repository-owned content. Links to source files
// resolve from its actual location so they work on the hosted site as well.
function resolveLink(href: string): string {
  // Keep canonical website links useful in local Astro previews, too.
  if (href.startsWith('https://evalkit.leostera.dev/')) {
    const url = new URL(href);
    return `${url.pathname}${url.search}${url.hash}`;
  }
  if (
    href.startsWith('#') ||
    href.startsWith('https://') ||
    href.startsWith('http://')
  )
    return href;
  if (href.startsWith('./') || href.startsWith('../'))
    return new URL(href, sourceBase).href;
  return href;
}

const tokens = marked.lexer(source);
export const sections = tokens
  .filter(
    (token): token is Tokens.Heading =>
      token.type === 'heading' && token.depth === 2,
  )
  .map(({ text }) => ({ title: text, id: slug(text) }));

const highlighted = new WeakMap<object, string>();
const renderer = new Marked({
  async: true,
  async walkTokens(token) {
    if (
      token.type !== 'code' ||
      !('text' in token) ||
      typeof token.text !== 'string'
    )
      return;
    const language =
      'lang' in token && typeof token.lang === 'string'
        ? token.lang.split(/\s+/)[0]
        : 'text';
    const supported = [
      'sh',
      'bash',
      'ts',
      'typescript',
      'text',
      'json',
      'jsonc',
    ];
    highlighted.set(
      token,
      await codeToHtml(token.text, {
        lang: supported.includes(language) ? language : 'text',
        theme: 'github-light',
      }),
    );
  },
  renderer: {
    heading(token) {
      const title = this.parser.parseInline(token.tokens);
      return `<h${token.depth} id="${escapeAttribute(slug(token.text))}">${title}</h${token.depth}>`;
    },
    link(token) {
      const href = escapeAttribute(resolveLink(token.href));
      const title = token.title
        ? ` title="${escapeAttribute(token.title)}"`
        : '';
      return `<a href="${href}"${title}>${this.parser.parseInline(token.tokens)}</a>`;
    },
    code(token) {
      return highlighted.get(token) ?? '';
    },
  },
});

export const manualHtml = await renderer.parse(source);
