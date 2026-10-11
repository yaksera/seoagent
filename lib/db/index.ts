import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import * as schema from './schema';

// DATABASE_URL set → real Postgres (production, e.g. Neon/Supabase).
// Not set → PGlite, an embedded Postgres stored in ./data/pglite (zero-setup local dev).
type Db = Awaited<ReturnType<typeof connect>>['db'];

const migrationsFolder = () => path.join(process.cwd(), 'drizzle');

async function connect() {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const { Pool } = await import('pg');
    const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }), { schema });
    return { db: db as unknown as ReturnType<typeof import('drizzle-orm/pglite').drizzle<typeof schema>>, migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }) };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  // PGLITE_DIR=memory:// gives a throwaway in-memory database (used by tests).
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), 'data', 'pglite');
  if (!dir.startsWith('memory://')) await mkdir(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  return { db, migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }) };
}

// Number of migration files; in development a new one is applied without restarting the server.
function migrationCount() {
  try {
    return (JSON.parse(readFileSync(path.join(migrationsFolder(), 'meta', '_journal.json'), 'utf8')).entries as unknown[]).length;
  } catch {
    return 0;
  }
}

// One instance per process (survives Next.js hot reloads in dev).
const g = globalThis as unknown as { __db?: Promise<{ db: Db; migrate: () => Promise<void>; applied: number }> };

async function init() {
  const conn = await connect();
  const applied = migrationCount();
  await conn.migrate();
  return { ...conn, applied };
}

export async function getDb(): Promise<Db> {
  // A failed connection isn't cached, so the next call retries.
  g.__db ??= init().catch(e => { g.__db = undefined; throw e; });
  let state = await g.__db;
  // A dev server started on older code cached the bare db object; adopt it instead of reconnecting.
  if (!('migrate' in state)) {
    const db = state as unknown as Db;
    const { migrate } = process.env.DATABASE_URL ? await import('drizzle-orm/node-postgres/migrator') : await import('drizzle-orm/pglite/migrator');
    state = { db, migrate: () => (migrate as (d: unknown, o: { migrationsFolder: string }) => Promise<void>)(db, { migrationsFolder: migrationsFolder() }), applied: 0 };
    g.__db = Promise.resolve(state);
  }
  if (process.env.NODE_ENV !== 'production') {
    const count = migrationCount();
    if (count > state.applied) {
      state.applied = count;
      await state.migrate();
    }
  }
  return state.db;
}

export { schema };
