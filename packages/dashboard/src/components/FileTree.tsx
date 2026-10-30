import {
  CaretRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErrorBanner } from './ErrorBanner.js';

export type FileTreeEntry = {
  path: string;
  kind?: 'file' | 'directory';
  size?: number;
};

type Node = {
  name: string;
  path: string;
  size?: number;
  children?: Map<string, Node>;
};

/** Nests flat `a/b/c` paths; directories need not be listed themselves. */
export function fileTree(entries: readonly FileTreeEntry[]): Node {
  const root: Node = { name: '', path: '', children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let node = root;
    parts.forEach((name, index) => {
      const last = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');
      let child = node.children!.get(name);
      if (!child) {
        child = { name, path };
        node.children!.set(name, child);
      }
      if (!last || entry.kind === 'directory') child.children ??= new Map();
      else child.size = entry.size;
      node = child;
    });
  }
  return root;
}

/** Directories first, then files, each alphabetically. */
function sorted(node: Node): Node[] {
  return [...(node.children?.values() ?? [])].sort(
    (a, b) =>
      Number(!a.children) - Number(!b.children) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

export function formatBytes(size: number | undefined): string {
  if (size === undefined) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Small trees open fully; large ones open their first level only. */
const OPEN_ALL_BELOW = 40;

/**
 * A small file explorer: a collapsible tree beside a preview of the selected
 * file. `selected`/`onSelect` let a page keep the open file in its URL.
 */
export function FileTree({
  entries,
  rootLabel,
  readFile,
  selected: controlled,
  onSelect,
  emptyMessage = 'No files.',
}: {
  entries: readonly FileTreeEntry[];
  /** Shown as the tree's root, e.g. the dataset's mount. */
  rootLabel?: string;
  /** Loads a file's contents for the preview; without it, files only list. */
  readFile?(path: string): Promise<Response>;
  selected?: string;
  onSelect?(path: string): void;
  emptyMessage?: string;
}) {
  const tree = useMemo(() => fileTree(entries), [entries]);
  const files = entries.filter((entry) => entry.kind !== 'directory').length;
  const [local, setLocal] = useState<string>();
  const selected = controlled ?? local;
  const select = onSelect ?? setLocal;
  const [closed, setClosed] = useState<Set<string>>(
    () =>
      new Set(
        files < OPEN_ALL_BELOW
          ? []
          : entries.flatMap((entry) => {
              const parts = entry.path.split('/');
              return parts.length > 2 ? [parts.slice(0, 2).join('/')] : [];
            }),
      ),
  );
  const toggle = (path: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  if (!entries.length)
    return <p className="text-[13px] text-kumo-subtle">{emptyMessage}</p>;

  const renderNode = (node: Node, depth: number): ReactNode => {
    const isDirectory = Boolean(node.children);
    const open = isDirectory && !closed.has(node.path);
    const Icon = isDirectory ? (open ? FolderOpenIcon : FolderIcon) : FileIcon;
    return (
      <li key={node.path}>
        <button
          type="button"
          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left font-mono text-xs hover:bg-kumo-tint ${
            node.path === selected
              ? 'bg-kumo-tint font-semibold text-kumo-strong'
              : 'text-kumo-default'
          }`}
          style={{ paddingLeft: `${depth * 0.9 + 0.375}rem` }}
          title={node.path}
          aria-expanded={isDirectory ? open : undefined}
          aria-current={node.path === selected ? 'true' : undefined}
          onClick={() => (isDirectory ? toggle(node.path) : select(node.path))}
        >
          {isDirectory ? (
            <CaretRightIcon
              aria-hidden
              className={`size-3 shrink-0 text-kumo-subtle transition-transform ${open ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <Icon aria-hidden className="size-3.5 shrink-0 text-kumo-subtle" />
          <span className="truncate">{node.name}</span>
          {!isDirectory && node.size !== undefined ? (
            <span className="ml-auto shrink-0 pl-2 text-[11px] font-normal text-kumo-subtle tabular-nums">
              {formatBytes(node.size)}
            </span>
          ) : null}
        </button>
        {open ? (
          <ul>{sorted(node).map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  const selectedEntry = entries.find((entry) => entry.path === selected);
  return (
    <div className="file-explorer grid min-w-0 overflow-hidden rounded-lg border border-kumo-line bg-kumo-base md:grid-cols-[minmax(14rem,18rem)_1fr]">
      <div className="max-h-[28rem] overflow-auto border-b border-kumo-line p-1.5 md:border-r md:border-b-0">
        <p className="flex items-center justify-between px-1.5 pb-1 text-[11px] font-medium text-kumo-subtle">
          <span className="truncate font-mono">{rootLabel ?? 'Files'}</span>
          <span className="tabular-nums">
            {files} {files === 1 ? 'file' : 'files'}
          </span>
        </p>
        <ul aria-label={rootLabel ?? 'Files'}>
          {sorted(tree).map((node) => renderNode(node, 0))}
        </ul>
      </div>
      <FilePreview
        path={selectedEntry ? selectedEntry.path : undefined}
        size={selectedEntry?.size}
        readFile={readFile}
      />
    </div>
  );
}

/** Previews are capped so a large file never freezes the page. */
const PREVIEW_BYTES = 256 * 1024;

type Preview =
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'image'; url: string }
  | { kind: 'binary' };

function FilePreview({
  path,
  size,
  readFile,
}: {
  path?: string;
  size?: number;
  readFile?(path: string): Promise<Response>;
}) {
  const [state, setState] = useState<{
    path?: string;
    preview?: Preview;
    error?: string;
  }>({});
  useEffect(() => {
    if (!path || !readFile) return;
    let active = true;
    let url: string | undefined;
    void readFile(path)
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? '';
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (type.startsWith('image/')) {
          url = URL.createObjectURL(new Blob([bytes], { type }));
          return { kind: 'image', url } as const;
        }
        const head = bytes.subarray(0, PREVIEW_BYTES);
        // A NUL byte in the first chunk is a reliable sign of binary content.
        if (head.subarray(0, 8000).includes(0))
          return { kind: 'binary' } as const;
        return {
          kind: 'text',
          text: new TextDecoder().decode(head),
          truncated: bytes.byteLength > PREVIEW_BYTES,
        } as const;
      })
      .then((preview) => {
        if (active) setState({ path, preview });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            path,
            error:
              cause instanceof Error ? cause.message : 'Unable to read file',
          });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, readFile]);

  if (!path)
    return (
      <div className="flex min-h-32 items-center justify-center p-4 text-[13px] text-kumo-subtle">
        Select a file to preview it.
      </div>
    );
  const current = state.path === path ? state : {};
  return (
    <section
      aria-label={`Preview of ${path}`}
      className="flex min-w-0 flex-col"
    >
      <header className="flex items-center gap-2 border-b border-kumo-line px-3 py-1.5">
        <span
          className="truncate font-mono text-xs text-kumo-strong"
          title={path}
        >
          {path}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-kumo-subtle tabular-nums">
          {formatBytes(size)}
        </span>
      </header>
      <div className="max-h-[28rem] min-h-32 overflow-auto">
        {!readFile ? (
          <p className="p-3 text-[13px] text-kumo-subtle">
            File contents are not available here.
          </p>
        ) : current.error ? (
          <div className="p-3">
            <ErrorBanner message={current.error} />
          </div>
        ) : !current.preview ? (
          <p className="p-3 text-[13px] text-kumo-subtle">Loading…</p>
        ) : current.preview.kind === 'image' ? (
          <img
            src={current.preview.url}
            alt={path}
            className="max-w-full p-3"
          />
        ) : current.preview.kind === 'binary' ? (
          <p className="p-3 text-[13px] text-kumo-subtle">
            Binary file; no preview.
          </p>
        ) : (
          <>
            <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre text-kumo-default">
              {current.preview.text}
            </pre>
            {current.preview.truncated ? (
              <p className="px-3 pb-3 text-xs text-kumo-subtle">
                Showing the first {formatBytes(PREVIEW_BYTES)}.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
