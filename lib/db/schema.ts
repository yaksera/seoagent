import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// An account is the billing unit (one per customer); users belong to one account.
export const accounts = pgTable('accounts', {
  id: id(),
  name: text('name').notNull(),
  plan: text('plan', { enum: ['trial', 'active', 'past_due', 'canceled'] }).notNull().default('trial'),
  siteQuantity: integer('site_quantity').notNull().default(1),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: id(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('owner'),
  isAdmin: boolean('is_admin').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
}, t => [uniqueIndex('users_email_idx').on(t.email)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  impersonatorId: uuid('impersonator_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
}, t => [index('sessions_user_idx').on(t.userId)]);

export const emailTokens = pgTable('email_tokens', {
  id: text('id').primaryKey(), // sha256 of the emailed token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['verify', 'reset'] }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const sites = pgTable('sites', {
  id: id(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  url: text('url').notNull(),
  host: text('host').notNull(),
  verificationToken: text('verification_token').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  settings: jsonb('settings').$type<{ weeklyCrawl?: boolean; reportEmails?: boolean }>().notNull().default({}),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
}, t => [index('sites_account_idx').on(t.accountId)]);

// One row per audit run. accountId/siteId are null for anonymous free audits.
export const audits = pgTable('audits', {
  id: id(),
  accountId: uuid('account_id').references(() => accounts.id),
  siteId: uuid('site_id').references(() => sites.id),
  url: text('url').notNull(),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
  trigger: text('trigger', { enum: ['free', 'manual', 'scheduled'] }).notNull(),
  maxPages: integer('max_pages').notNull(),
  score: integer('score'),
  pagesCount: integer('pages_count'),
  issues: jsonb('issues'),
  crawl: jsonb('crawl'),
  error: text('error'),
  ip: text('ip'),
  durationMs: integer('duration_ms'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: createdAt(),
}, t => [index('audits_site_idx').on(t.siteId, t.createdAt), index('audits_account_idx').on(t.accountId)]);

export const fixes = pgTable('fixes', {
  id: id(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => accounts.id),
  siteId: uuid('site_id').references(() => sites.id),
  pageUrl: text('page_url').notNull(),
  suggestion: jsonb('suggestion').notNull(),
  // Publishing (WordPress etc.): what was written, what it replaced, so it can be rolled back.
  status: text('status', { enum: ['suggested', 'applied', 'rolled_back', 'failed', 'conflict'] }).notNull().default('suggested'),
  applied: jsonb('applied'),
  previous: jsonb('previous'),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  error: text('error'),
  createdAt: createdAt(),
}, t => [uniqueIndex('fixes_audit_page_idx').on(t.auditId, t.pageUrl)]);

export const integrations = pgTable('integrations', {
  id: id(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  provider: text('provider', { enum: ['wordpress', 'google'] }).notNull(),
  status: text('status', { enum: ['connected', 'error'] }).notNull().default('connected'),
  credentials: text('credentials').notNull(), // encrypted JSON
  meta: jsonb('meta').notNull().default({}),
  lastError: text('last_error'),
  createdAt: createdAt(),
}, t => [uniqueIndex('integrations_site_provider_idx').on(t.siteId, t.provider)]);

export const gscRows = pgTable('gsc_rows', {
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  page: text('page').notNull(),
  query: text('query').notNull(),
  clicks: integer('clicks').notNull(),
  impressions: integer('impressions').notNull(),
  position: numeric('position', { mode: 'number' }).notNull(),
}, t => [uniqueIndex('gsc_rows_pk').on(t.siteId, t.date, t.page, t.query)]);

export const llmCalls = pgTable('llm_calls', {
  id: id(),
  accountId: uuid('account_id'),
  siteId: uuid('site_id'),
  feature: text('feature').notNull(),
  model: text('model'),
  costUsd: numeric('cost_usd', { mode: 'number' }),
  latencyMs: integer('latency_ms'),
  ok: boolean('ok').notNull(),
  error: text('error'),
  createdAt: createdAt(),
}, t => [index('llm_calls_account_idx').on(t.accountId, t.createdAt)]);

export const jobs = pgTable('jobs', {
  id: id(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: createdAt(),
}, t => [index('jobs_claim_idx').on(t.status, t.runAt)]);

export const auditLog = pgTable('audit_log', {
  id: id(),
  accountId: uuid('account_id'),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  target: text('target'),
  meta: jsonb('meta'),
  ip: text('ip'),
  createdAt: createdAt(),
}, t => [index('audit_log_action_idx').on(t.action, t.createdAt)]);

export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  createdAt: createdAt(),
});

export const notifications = pgTable('notifications', {
  id: id(),
  accountId: uuid('account_id').notNull(),
  siteId: uuid('site_id'),
  type: text('type').notNull(),
  key: text('key').notNull(), // dedupe key, e.g. "report:2026-10"
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('notifications_key_idx').on(t.accountId, t.key)]);
