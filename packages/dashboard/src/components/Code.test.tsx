import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Code, CodeProvider, codeLanguage } from './Code.js';

test("code's language: named, by its file's extension, or JSON by its content", () => {
  expect(codeLanguage({ code: '', lang: 'ts' })).toBe('typescript');
  expect(codeLanguage({ code: '', lang: 'sh' })).toBe('bash');
  expect(codeLanguage({ code: '', path: 'src/app.TSX' })).toBe('tsx');
  expect(codeLanguage({ code: '', path: 'logs/run.jsonl' })).toBe('json');
  expect(codeLanguage({ code: '', path: 'Cargo.toml' })).toBe('toml');
  expect(codeLanguage({ code: '{"a": [1, 2]}' })).toBe('json');
  // No grammar fits: plain text.
  expect(codeLanguage({ code: '', path: 'main.ml' })).toBeUndefined();
  expect(codeLanguage({ code: '', lang: 'ocaml' })).toBeUndefined();
  expect(codeLanguage({ code: '{ not json' })).toBeUndefined();
  expect(codeLanguage({ code: 'All done.' })).toBeUndefined();
});

test('code is text, never markup, until it is highlighted', () => {
  const html = renderToStaticMarkup(
    <CodeProvider>
      <Code code={'<script>alert(1)</script>'} path="index.html" wrap />
    </CodeProvider>,
  );
  expect(html).toContain('data-language="html"');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
});
