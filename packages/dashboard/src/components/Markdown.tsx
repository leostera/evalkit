import { cn } from '@cloudflare/kumo';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

/**
 * Typography for rendered messages, scoped to this wrapper: compact, like
 * the rest of the trajectory, with code and tables that scroll sideways.
 */
const prose = cn(
  'markdown min-w-0 text-[13px] leading-relaxed break-words text-kumo-default',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-2',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:text-kumo-strong',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-kumo-strong',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-kumo-strong',
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5 [&_li>p]:my-0.5 [&_li::marker]:text-kumo-subtle',
  // GFM task lists: the checkbox replaces the bullet.
  '[&_li:has(>input)]:list-none [&_li>input]:mr-1.5 [&_li>input]:align-middle',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-kumo-line [&_blockquote]:pl-3 [&_blockquote]:text-kumo-subtle',
  '[&_hr]:my-3 [&_hr]:border-kumo-hairline',
  '[&_a]:text-kumo-link [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:font-semibold [&_strong]:text-kumo-strong',
  // Inline code, then code blocks (whose code must not look inline).
  '[&_code]:rounded [&_code]:bg-kumo-elevated [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[12px]',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-kumo-elevated [&_pre]:px-3 [&_pre]:py-2 [&_pre]:leading-normal',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[12px]',
  '[&_th]:border [&_th]:border-kumo-hairline [&_th]:bg-kumo-elevated [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border [&_td]:border-kumo-hairline [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
);

// Single newlines are line breaks, as in GitHub comments: agents write them
// expecting them to show.
const plugins = [remarkGfm, remarkBreaks];

/** Whether rendering would change how `text` reads. */
export function looksLikeMarkdown(text: string): boolean {
  return /[`*_#>|[\]~]|^\s*([-+]|\d+\.)\s/m.test(text);
}

const components: Components = {
  // Agent output is untrusted: links open elsewhere and send no referrer.
  a: ({ href, title, children }) => (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      {children}
    </a>
  ),
  // Never load remote images from a transcript (they can track whoever
  // reviews it); show where they point instead.
  img: ({ src, alt }) =>
    typeof src === 'string' && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {alt ? `Image: ${alt}` : 'Image'}
      </a>
    ) : (
      <span className="text-kumo-subtle">
        {alt ? `Image: ${alt}` : 'Image'}
      </span>
    ),
};

/**
 * GitHub-flavoured Markdown from an agent, with single newlines kept. Raw HTML in the text is shown as
 * text, never rendered, and unsafe link protocols are dropped.
 */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn(prose, className)}>
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
