import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import * as schema from './schema';

// DATABASE_URL set → real Postgres (production, e.g. Neon/Supabase).
// Not set → PGlite, an embedded Postgres stored in ./data/pglite (zero-setup local dev).
type Db = Awaited<ReturnType<typeof createDb>>;

async function createDb() {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const { Pool } = await import('pg');
    const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }), { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as ReturnType<typeof import('drizzle-orm/pglite').drizzle<typeof schema>>;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = path.join(process.cwd(), 'data', 'pglite');
  await mkdir(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

// One instance per process (survives Next.js hot reloads in dev).
const g = globalThis as unknown as { __db?: Promise<Db> };
export function getDb(): Promise<Db> {
  // A failed connection isn't cached, so the next call retries.
  g.__db ??= createDb().catch(e => { g.__db = undefined; throw e; });
  return g.__db;
}

export { schema };
