import { ShareIndexDb, type ShareIndex, type SqlValue } from './index-db.js';

/** The subset of Durable Object state used by the index. */
type DurableObjectStateLike = {
  storage: {
    sql: {
      exec(query: string, ...params: SqlValue[]): { toArray(): unknown[] };
    };
    transactionSync<T>(work: () => T): T;
  };
};

type DurableObjectNamespaceLike = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};

const METHODS = [
  'hasRun',
  'recordRun',
  'repos',
  'commits',
  'runs',
  'resolve',
  'latest',
] as const satisfies readonly (keyof ShareIndex)[];
type Method = (typeof METHODS)[number];

/**
 * One SQLite-backed Durable Object holds the whole index. It serializes every
 * write, so concurrent uploads for the same commit never race.
 * Bind it with `new_sqlite_classes: ["ShareIndex"]`.
 */
export class ShareIndexObject {
  private readonly db: ShareIndexDb;

  constructor(state: DurableObjectStateLike) {
    const { sql } = state.storage;
    this.db = new ShareIndexDb({
      all: <T>(query: string, ...params: SqlValue[]) =>
        sql.exec(query, ...params).toArray() as T[],
      run: (query, ...params) => {
        sql.exec(query, ...params);
      },
      transaction: (work) => state.storage.transactionSync(work),
    });
  }

  async fetch(request: Request): Promise<Response> {
    const { method, args } = (await request.json()) as {
      method: Method;
      args: unknown[];
    };
    if (!METHODS.includes(method))
      return new Response(`Unknown index method: ${String(method)}`, {
        status: 400,
      });
    const call = this.db[method] as (...values: unknown[]) => unknown;
    return Response.json({ result: call.apply(this.db, args) ?? null });
  }
}

/** The Worker's view of the index: each call is one request to the object. */
export function durableObjectIndex(
  namespace: DurableObjectNamespaceLike,
): ShareIndex {
  const stub = namespace.get(namespace.idFromName('index'));
  const call = async (method: Method, ...args: unknown[]) => {
    const response = await stub.fetch(
      new Request('https://share-index/rpc', {
        method: 'POST',
        body: JSON.stringify({ method, args }),
      }),
    );
    if (!response.ok)
      throw new Error(`Index ${method} failed: ${await response.text()}`);
    const { result } = (await response.json()) as { result: unknown };
    return result ?? undefined;
  };
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      (...args: unknown[]) => call(method, ...args),
    ]),
  ) as unknown as ShareIndex;
}
