import { cn } from '@cloudflare/kumo';
import {
  normalizeLanguage,
  ShikiProvider,
  useShikiHighlighter,
  type LanguageInput,
} from '@cloudflare/kumo/code';
import { useMemo, type ReactNode } from 'react';

/** Every grammar Kumo bundles, so any code the dashboard shows can be highlighted. */
const LANGUAGES: LanguageInput[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'json',
  'jsonc',
  'html',
  'css',
  'python',
  'yaml',
  'markdown',
  'graphql',
  'sql',
  'bash',
  'diff',
  'hcl',
  'toml',
];

/** Loads the highlighter once for every `Code` below it: the app's root. */
export function CodeProvider({ children }: { children: ReactNode }) {
  return (
    <ShikiProvider engine="javascript" languages={LANGUAGES}>
      {children}
    </ShikiProvider>
  );
}

/** File extensions whose grammar differs from the extension's own name. */
const EXTENSIONS: Record<string, string> = {
  jsonl: 'json',
  ndjson: 'json',
  htm: 'html',
  svg: 'html',
  xml: 'html',
  bash: 'bash',
  tf: 'hcl',
  patch: 'diff',
};

/**
 * The grammar for some code: `lang` when given (a name or alias such as
 * `ts`), else its file's extension, else JSON when it parses as JSON.
 * `undefined` when no bundled grammar fits, so it is shown as plain text.
 */
export function codeLanguage(input: {
  lang?: string;
  path?: string;
  code: string;
}): LanguageInput | undefined {
  const named = (name: string | undefined) =>
    name ? (normalizeLanguage(name.toLowerCase()) ?? undefined) : undefined;
  if (input.lang) return named(input.lang);
  const extension = input.path?.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  if (extension) return named(EXTENSIONS[extension] ?? extension);
  return looksLikeJson(input.code) ? 'json' : undefined;
}

function looksLikeJson(code: string): boolean {
  const text = code.trim();
  if (!/^[[{]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// Highlighting runs on the main thread; past this, a file is shown as text.
const MAX_HIGHLIGHTED = 256 * 1024;

/**
 * Code, always through this component: highlighted by its language (from
 * `lang`, `path` or its content), in the dashboard's compact type, and as
 * plain text until the highlighter loads or when no grammar fits.
 */
export function Code({
  code,
  lang,
  path,
  wrap = false,
  className,
}: {
  code: string;
  /** A grammar name or alias: `ts`, `json`, `sh`. */
  lang?: string;
  /** The file it came from, for its extension. */
  path?: string;
  /** Wrap long lines rather than scroll sideways. */
  wrap?: boolean;
  /** Sizing and spacing: `max-h-96`, a border. */
  className?: string;
}) {
  const { highlight } = useShikiHighlighter();
  const language = codeLanguage({
    code,
    ...(lang ? { lang } : {}),
    ...(path ? { path } : {}),
  });
  const html = useMemo(
    () =>
      language && code.length <= MAX_HIGHLIGHTED
        ? highlight(code, language)
        : null,
    [highlight, code, language],
  );
  const lines = wrap
    ? '[&_pre]:break-words [&_pre]:whitespace-pre-wrap [&_code]:!w-auto'
    : '[&_pre]:whitespace-pre';
  const box = cn(
    'code overflow-auto rounded-md bg-kumo-elevated font-mono text-xs leading-relaxed text-kumo-default',
    '[&_pre]:!m-0 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:outline-none [&_code]:!pr-0',
    lines,
    className,
  );
  if (html === null)
    return (
      <div className={box} data-language={language}>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  return (
    <div
      className={cn(box, 'kumo-shiki')}
      data-language={language}
      // Shiki escapes the code: this is its markup, not the text's.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
