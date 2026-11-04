import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeProvider } from './Code.js';
import { Markdown, looksLikeMarkdown } from './Markdown.js';

const html = (text: string) =>
  renderToStaticMarkup(
    <CodeProvider>
      <Markdown>{text}</Markdown>
    </CodeProvider>,
  );

test('renders GitHub-flavoured Markdown, keeping single newlines', () => {
  const out = html(
    '## Done\n\n- **built**\n- `tested`\n\n```sh\nriot test\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nBUILD: x\nTEST: y',
  );
  expect(out).toContain('<h2>Done</h2>');
  expect(out).toContain('<strong>built</strong>');
  expect(out).toContain('<code>tested</code>');
  // A fenced block is a `Code`, by its language (plain until the highlighter loads).
  expect(out).toContain(
    'data-language="bash"><pre><code>riot test</code></pre>',
  );
  expect(out).toContain('<td>1</td>');
  expect(out).toContain('BUILD: x<br/>');
});

test('agent text cannot inject HTML, scripts or tracking images', () => {
  const out = html(
    '<img src=x onerror=alert(1)> [click](javascript:alert(1)) ![pixel](https://tracker.example/p.gif) [docs](https://example.com)',
  );
  expect(out).not.toContain('<img');
  expect(out).not.toContain('javascript:');
  expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(out).toContain('>Image: pixel</a>');
  expect(out).toContain(
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">docs</a>',
  );
});

test('plain replies are left as text', () => {
  expect(
    looksLikeMarkdown('All 3 tests pass.\nDone, it serves on port 7001.'),
  ).toBe(false);
  expect(looksLikeMarkdown('Ran `riot test`.')).toBe(true);
  expect(looksLikeMarkdown('Steps:\n1. build\n2. test')).toBe(true);
});
