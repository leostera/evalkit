/**
 * The few platform services the CLI needs, on Bun or Node. Everything else
 * uses `node:` APIs, which both runtimes provide.
 */
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { pathToFileURL } from 'node:url';

export const onBun =
  typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

/** Node 22.18 is the first 22.x that runs the CLI's own code unflagged. */
export function assertSupportedRuntime(version = process.versions.node): void {
  if (onBun) return;
  const [major = 0, minor = 0] = version.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18))
    throw new Error(
      `EvalKit needs Node 22.18 or later, or Bun; this is Node ${version}.`,
    );
}

export type Server = { port: number; stop(): Promise<void> };

type Fetch = (request: Request) => Response | Promise<Response>;

/** Serves a fetch handler on `port` (0 picks a free one). */
export async function serve(fetch: Fetch, port: number): Promise<Server> {
  if (onBun) {
    const bun = (globalThis as unknown as { Bun: BunServe }).Bun;
    const server = bun.serve({ port, fetch });
    return { port: server.port, stop: async () => server.stop(true) };
  }
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      try {
        const response = await fetch(toRequest(incoming, port));
        outgoing.writeHead(response.status, [...response.headers]);
        if (response.body)
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>)
            outgoing.write(chunk);
        outgoing.end();
      } catch (error) {
        outgoing.statusCode = 500;
        outgoing.end(error instanceof Error ? error.message : 'Internal error');
      }
    })();
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolvePromise());
  });
  const address = server.address();
  return {
    port: typeof address === 'object' && address ? address.port : port,
    stop: () =>
      new Promise<void>((resolvePromise) =>
        server.close(() => resolvePromise()),
      ),
  };
}

type BunServe = {
  serve(options: { port: number; fetch: Fetch }): {
    port: number;
    stop(closeActiveConnections?: boolean): void;
  };
};

function toRequest(incoming: IncomingMessage, port: number): Request {
  const host = incoming.headers.host ?? `localhost:${port}`;
  const url = new URL(incoming.url ?? '/', `http://${host}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers))
    if (value !== undefined)
      for (const item of Array.isArray(value) ? value : [value])
        headers.append(name, item);
  const method = incoming.method ?? 'GET';
  return new Request(url, {
    method,
    headers,
    ...(method === 'GET' || method === 'HEAD'
      ? {}
      : {
          body: incoming as unknown as ReadableStream,
          duplex: 'half',
        }),
  } as RequestInit);
}

export const sleep = (ms: number) =>
  new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

/** Best effort; the printed URL stays authoritative. */
export function openInBrowser(url: string): void {
  const opener =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  try {
    const child = spawn(opener, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // No browser opener on this machine.
  }
}

let jiti: { import(id: string): Promise<unknown> } | undefined;

/**
 * Imports a project's TypeScript or JavaScript module. Bun loads TypeScript
 * natively; on Node, jiti handles TypeScript, including `.js` specifiers that
 * point at `.ts` files.
 */
export async function importProjectModule(file: string): Promise<unknown> {
  if (onBun || /\.(m?js|cjs)$/.test(file))
    return import(pathToFileURL(file).href);
  if (!jiti) {
    const { createJiti } = await import('jiti');
    jiti = createJiti(import.meta.url, { moduleCache: false });
  }
  return jiti.import(file);
}

/**
 * A glob matcher for discovery: `*` and `?` stay within a path segment, `**`
 * spans segments, and `{a,b}` is an alternation.
 */
export function globMatcher(pattern: string): (path: string) => boolean {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '*' && pattern[index + 1] === '*') {
      index++;
      if (pattern[index + 1] === '/') {
        index++;
        source += '(?:.*/)?';
      } else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '{') {
      const end = pattern.indexOf('}', index);
      if (end === -1) source += '\\{';
      else {
        source += `(?:${pattern
          .slice(index + 1, end)
          .split(',')
          .map((part) =>
            part.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
          )
          .join('|')})`;
        index = end;
      }
    } else source += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const expression = new RegExp(`^${source}$`);
  return (path) => expression.test(path);
}
