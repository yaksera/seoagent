import { sql } from 'drizzle-orm';
import { getDb } from './db';

// Housekeeping, every 6 hours: data retention and permanent deletion of closed accounts.
export async function runMaintenance() {
  const db = await getDb();
  await db.execute(sql`delete from sessions where expires_at < now()`);
  await db.execute(sql`delete from email_tokens where expires_at < now() - interval '1 day'`);
  await db.execute(sql`delete from jobs where status = 'done' and created_at < now() - interval '14 days'`);
  await db.execute(sql`delete from jobs where status = 'failed' and created_at < now() - interval '60 days'`);
  // Free audits are kept 30 days; crawl data of old account audits is trimmed after 180 days.
  await db.execute(sql`delete from audits where trigger = 'free' and created_at < now() - interval '30 days'`);
  await db.execute(sql`update audits set crawl = null where crawl is not null and created_at < now() - interval '180 days'`);
  await db.execute(sql`delete from gsc_rows where date::date < current_date - 480`);
  await db.execute(sql`delete from audit_log where created_at < now() - interval '400 days'`);
  await db.execute(sql`delete from stripe_events where created_at < now() - interval '90 days'`);

  // Accounts deleted 30+ days ago: remove everything that belongs to them.
  const doomed = (await db.execute(sql`select id from accounts where deleted_at < now() - interval '30 days'`)).rows as { id: string }[];
  for (const { id } of doomed) {
    await db.transaction(async tx => {
      await tx.execute(sql`delete from fixes where account_id = ${id}`);
      await tx.execute(sql`delete from gsc_rows where site_id in (select id from sites where account_id = ${id})`);
      await tx.execute(sql`delete from integrations where account_id = ${id}`);
      await tx.execute(sql`delete from audits where account_id = ${id}`);
      await tx.execute(sql`delete from sites where account_id = ${id}`);
      await tx.execute(sql`delete from notifications where account_id = ${id}`);
      await tx.execute(sql`delete from llm_calls where account_id = ${id}`);
      await tx.execute(sql`delete from users where account_id = ${id}`);
      await tx.execute(sql`update audit_log set meta = null, ip = null where account_id = ${id}`);
      await tx.execute(sql`delete from accounts where id = ${id}`);
    });
  }
}
