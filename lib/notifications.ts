import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { getDb, schema } from './db';
import { appUrl, sendEmail } from './email';
import type { Issue } from './rules';

// Claims a dedupe key so each notification is sent at most once, even with several workers.
async function claim(accountId: string, siteId: string | null, type: string, key: string) {
  const db = await getDb();
  const [row] = await db.insert(schema.notifications).values({ accountId, siteId, type, key }).onConflictDoNothing().returning();
  return Boolean(row);
}

async function recipients(accountId: string) {
  const db = await getDb();
  return db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.accountId, accountId));
}

const html = (lines: string[], cta: { href: string; label: string }) => `<!doctype html><div style="font-family:system-ui,sans-serif;max-width:560px;color:#1b1f1d;line-height:1.5">
${lines.map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('\n')}
<p><a href="${cta.href}" style="display:inline-block;background:#1b1f1d;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${cta.label}</a></p>
<p style="color:#5f6661;font-size:13px">You get this because email reports are on for this site. Turn them off in the site's settings.</p></div>`;

async function send(accountId: string, subject: string, lines: string[], cta: { href: string; label: string }) {
  for (const r of await recipients(accountId)) {
    await sendEmail(r.email, subject, `${lines.join('\n\n')}\n\n${cta.label}: ${cta.href}`, html(lines, cta));
  }
}

// After an audit: alert when the score drops 10+ points or new critical problems appear.
export async function auditAlerts(auditId: string) {
  const db = await getDb();
  const [audit] = await db.select().from(schema.audits).where(eq(schema.audits.id, auditId));
  if (!audit?.siteId || !audit.accountId || audit.status !== 'done') return;
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.id, audit.siteId));
  if (!site || site.settings.reportEmails === false) return;
  const [prev] = await db.select().from(schema.audits)
    .where(and(eq(schema.audits.siteId, audit.siteId), eq(schema.audits.status, 'done'), ne(schema.audits.id, audit.id), lt(schema.audits.createdAt, audit.createdAt)))
    .orderBy(desc(schema.audits.createdAt)).limit(1);
  if (!prev) return;

  const critical = (issues: unknown) => new Map(((issues as Issue[]) ?? []).filter(i => i.severity === 'critical').map(i => [i.id, i]));
  const before = critical(prev.issues);
  const fresh = [...critical(audit.issues).values()].filter(i => !before.has(i.id));
  const drop = (prev.score ?? 0) - (audit.score ?? 0);
  if (drop < 10 && fresh.length === 0) return;
  if (!(await claim(audit.accountId, site.id, 'alert', `alert:${audit.id}`))) return;

  const lines = [`The latest audit of ${site.host} found new problems.`];
  if (drop >= 10) lines.push(`Health score dropped from ${prev.score} to ${audit.score}.`);
  for (const i of fresh) lines.push(`New: ${i.name} (${i.findings.length} page${i.findings.length === 1 ? '' : 's'}). ${i.why}`);
  await send(audit.accountId, `${site.host}: new SEO problems found`, lines, { href: `${appUrl()}/app/audits/${audit.id}`, label: 'See the report' });
}

// Monthly summary for each site, sent once per month from the 1st.
export async function monthlyReports() {
  const db = await getDb();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const label = lastMonthStart.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const key = `report:${lastMonthStart.toISOString().slice(0, 7)}`;

  const sites = await db.execute(sql`
    select s.id, s.host, s.account_id from sites s join accounts a on a.id = s.account_id
    where s.deleted_at is null and a.deleted_at is null and a.disabled_at is null
      and coalesce((s.settings->>'reportEmails')::boolean, true)
      and s.created_at < ${monthStart}
      and (a.plan = 'active' or (a.plan = 'trial' and a.trial_ends_at > now()))
      and not exists (select 1 from notifications n where n.account_id = s.account_id and n.key = ${key} || ':' || s.id::text)
    limit 200`);

  for (const s of sites.rows as { id: string; host: string; account_id: string }[]) {
    const audits = await db.select({ score: schema.audits.score, createdAt: schema.audits.createdAt }).from(schema.audits)
      .where(and(eq(schema.audits.siteId, s.id), eq(schema.audits.status, 'done'), lt(schema.audits.createdAt, monthStart)))
      .orderBy(desc(schema.audits.createdAt)).limit(10);
    if (!audits.length) continue;
    const inMonth = audits.filter(a => a.createdAt >= lastMonthStart);
    const latest = audits[0];
    const before = audits.find(a => a.createdAt < lastMonthStart) ?? inMonth[inMonth.length - 1];
    const [{ published }] = (await db.execute(sql`select count(*)::int as published from fixes
      where site_id = ${s.id} and status = 'applied' and applied_at >= ${lastMonthStart} and applied_at < ${monthStart}`)).rows as { published: number }[];
    const [gsc] = (await db.execute(sql`select coalesce(sum(clicks), 0)::int as clicks, coalesce(sum(impressions), 0)::int as impressions
      from gsc_rows where site_id = ${s.id} and date >= ${lastMonthStart.toISOString().slice(0, 10)} and date < ${monthStart.toISOString().slice(0, 10)}`)).rows as { clicks: number; impressions: number }[];

    if (!(await claim(s.account_id, s.id, 'report', `${key}:${s.id}`))) continue;
    const lines = [
      `Here is how ${s.host} did in ${label}.`,
      before && before !== latest ? `Health score: ${before.score} → ${latest.score}.` : `Health score: ${latest.score}.`,
      `Audits run: ${inMonth.length}. Fixes published: ${published}.`,
    ];
    if (gsc.impressions > 0) lines.push(`Google Search: ${gsc.clicks.toLocaleString('en-GB')} clicks from ${gsc.impressions.toLocaleString('en-GB')} impressions.`);
    await send(s.account_id, `${s.host}: your ${label} SEO report`, lines, { href: `${appUrl()}/app/sites/${s.id}`, label: 'Open your dashboard' });
  }
}

// Two days before a trial ends.
export async function trialReminders() {
  const db = await getDb();
  const soon = await db.select().from(schema.accounts).where(and(
    eq(schema.accounts.plan, 'trial'),
    gte(schema.accounts.trialEndsAt, new Date()),
    lt(schema.accounts.trialEndsAt, new Date(Date.now() + 2 * 86_400_000)),
  ));
  for (const a of soon) {
    if (a.deletedAt || !(await claim(a.id, null, 'trial', 'trial-ending'))) continue;
    await send(a.id, 'Your SEO Agent trial ends soon', [
      `Your free trial ends on ${a.trialEndsAt!.toLocaleDateString('en-GB')}.`,
      'Choose a plan to keep weekly audits, fixes and reports running. It is $49 per website per month.',
    ], { href: `${appUrl()}/app/billing`, label: 'Choose a plan' });
  }
}
