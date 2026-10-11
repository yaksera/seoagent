import { sql } from 'drizzle-orm';
import { getDb } from './db';

export type Totals = { clicks: number; impressions: number; position: number; prev_clicks: number; prev_impressions: number };
export type QueryRow = { query: string; page: string; clicks: number; impressions: number; position: number };

// Last 28 days vs the 28 before (Search Console data lags ~2 days, so windows end 2 days ago).
export async function searchTotals(siteId: string): Promise<Totals> {
  const db = await getDb();
  const res = await db.execute(sql`
    select
      coalesce(sum(clicks) filter (where date::date > current_date - 30), 0)::int as clicks,
      coalesce(sum(impressions) filter (where date::date > current_date - 30), 0)::int as impressions,
      coalesce(sum(position * impressions) filter (where date::date > current_date - 30)
        / nullif(sum(impressions) filter (where date::date > current_date - 30), 0), 0)::float as position,
      coalesce(sum(clicks) filter (where date::date <= current_date - 30 and date::date > current_date - 58), 0)::int as prev_clicks,
      coalesce(sum(impressions) filter (where date::date <= current_date - 30 and date::date > current_date - 58), 0)::int as prev_impressions
    from gsc_rows where site_id = ${siteId}`);
  return res.rows[0] as Totals;
}

async function grouped(siteId: string, kind: 'top' | 'almost', limit: number): Promise<QueryRow[]> {
  const db = await getDb();
  const having = kind === 'almost'
    ? sql`sum(impressions) >= 50 and sum(position * impressions) / nullif(sum(impressions), 0) between 8 and 20`
    : sql`sum(impressions) > 0`;
  const order = kind === 'almost' ? sql`impressions desc` : sql`clicks desc, impressions desc`;
  const res = await db.execute(sql`
    select query, (array_agg(page order by impressions desc))[1] as page, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
      (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
    from gsc_rows where site_id = ${siteId} and date::date > current_date - 30
    group by query having ${having} order by ${order} limit ${limit}`);
  return res.rows as QueryRow[];
}

export const topQueries = (siteId: string, limit = 15) => grouped(siteId, 'top', limit);
// Average position 8–20 with real demand: moving these to page one is usually the quickest win.
export const almostRanking = (siteId: string, limit = 15) => grouped(siteId, 'almost', limit);
