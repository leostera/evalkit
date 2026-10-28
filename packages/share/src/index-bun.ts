import { Database } from 'bun:sqlite';
import { asyncIndex, ShareIndexDb, type ShareIndex } from './index-db.js';

/** The index in a SQLite file, for `evalkit share serve` and tests. */
export function sqliteIndex(path: string): ShareIndex {
  const db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  return asyncIndex(
    new ShareIndexDb({
      all: (query, ...params) => db.query(query).all(...params) as never,
      run: (query, ...params) => {
        db.query(query).run(...params);
      },
      transaction: (work) => db.transaction(work)(),
    }),
  );
}
