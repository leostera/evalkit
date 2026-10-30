import {
  asyncIndex,
  ShareIndexDb,
  type ShareIndex,
  type Sql,
} from './index-db.js';

const onBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

/**
 * The index in a SQLite file, for `evalkit share serve` and tests: bun:sqlite
 * on Bun, node:sqlite on Node. Imported lazily so neither runtime loads the
 * other's module.
 */
export async function sqliteIndex(path: string): Promise<ShareIndex> {
  return asyncIndex(
    new ShareIndexDb(onBun ? await bunSql(path) : await nodeSql(path)),
  );
}

async function bunSql(path: string): Promise<Sql> {
  const { Database } = await import('bun:sqlite');
  const db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  return {
    all: (query, ...params) => db.query(query).all(...params) as never,
    run: (query, ...params) => {
      db.query(query).run(...params);
    },
    transaction: (work) => db.transaction(work)(),
  };
}

type NodeDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
};

async function nodeSql(path: string): Promise<Sql> {
  const { DatabaseSync } = (await import(
    // A variable specifier keeps bundlers and Bun's type checker from resolving it.
    'node:sqlite' as string
  )) as { DatabaseSync: new (path: string) => NodeDatabase };
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  let depth = 0;
  return {
    all: (query, ...params) => db.prepare(query).all(...params) as never,
    run: (query, ...params) => {
      db.prepare(query).run(...params);
    },
    transaction(work) {
      // Nested calls join the outer transaction, as bun:sqlite's do.
      if (depth++) {
        try {
          return work();
        } finally {
          depth--;
        }
      }
      db.exec('BEGIN');
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },
  };
}
