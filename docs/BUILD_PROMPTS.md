# SEO Agent — Build Prompts (paste one at a time)

How to use:
1. Create an empty folder, copy `docs/` and `CLAUDE.md` into it, open it in Claude Code (or Cursor).
2. Paste **Prompt 0** first. Then paste each next prompt only after the previous one passes its checks.
3. After each prompt: run the checks listed, commit (`git commit -m "<phase>"`), then continue.
4. If something breaks, say: "Prompt N acceptance check X fails with: <error>. Fix it without changing unrelated code."

Every prompt assumes the agent has read `CLAUDE.md`, `docs/REQUIREMENTS.md` and `docs/AGENT_PROMPTS.md`.

---

## Prompt 0 — Project setup

```
Read CLAUDE.md, docs/REQUIREMENTS.md and docs/AGENT_PROMPTS.md fully before writing code.

Set up a pnpm monorepo for the SEO Agent:
- apps/web: Next.js (latest stable, App Router, TypeScript strict, Tailwind CSS, src/ dir).
- apps/worker: Node 22 TypeScript service (tsx for dev, tsup build) that will run BullMQ workers.
- packages/db: Drizzle ORM + drizzle-kit, Postgres (use DATABASE_URL), migrations folder.
- packages/audit, packages/ai, packages/connectors, packages/integrations, packages/shared (zod schemas, types, constants like plan limits).
- wordpress-plugin/ (empty for now, with README).
- Tooling: ESLint, Prettier, Vitest in every package, tsconfig base with path aliases, turbo.json for build/test/lint/typecheck.
- docker-compose.yml with Postgres 16 and Redis 7 for local dev.
- .env.example copied from docs (keep every variable), env validation with zod in packages/shared/env.ts — the app must fail fast with a clear message if a required variable is missing.
- GitHub Actions CI: install, lint, typecheck, test on every push.
- Root README with setup steps.

Acceptance checks:
- `docker compose up -d && pnpm i && pnpm typecheck && pnpm test && pnpm lint` all pass.
- `pnpm --filter web dev` serves a placeholder page; `pnpm --filter worker dev` logs "worker ready".
Don't build features yet.
```

## Prompt 1 — Database schema

```
Implement the full data model from docs/REQUIREMENTS.md section 4 in packages/db with Drizzle:
- Use uuid primary keys (gen_random_uuid), timestamptz, enums for statuses/roles/severity/fix status.
- Indexes: every foreign key; pages(site_id, url) unique; issues(site_id, status); fixes(site_id, status); rank_checks(keyword_id, checked_at); gsc_daily(site_id, date); llm_calls(site_id, created_at).
- A scoped repository layer: `db.forAccount(accountId)` returns query helpers that ALWAYS filter by account_id (join via sites where needed). Route handlers and workers must use this, never raw table access, except in packages/db/admin.ts for the admin panel.
- Encryption helper in packages/shared/crypto.ts: AES-256-GCM encrypt/decrypt using ENCRYPTION_KEY (32 bytes base64), with key version prefix for rotation.
- Seed script with one demo account, user, site and sample pages/issues.

Acceptance checks:
- `pnpm db:generate && pnpm db:migrate && pnpm db:seed` work on a fresh database.
- Tests prove: account A's repository cannot read account B's sites, pages, issues, fixes or integrations.
- Tests prove encrypt→decrypt round-trips and tampered ciphertext throws.
```

## Prompt 2 — Auth, accounts and app shell

```
Add authentication and the app shell in apps/web:
- Use Better Auth (or Auth.js if you prefer) with email+password, email verification, password reset and Google sign-in. Store users in our Postgres via Drizzle.
- On first signup create an account + owner membership.
- Middleware protects /app/*; unauthenticated → /login.
- App shell: left sidebar (Dashboard, Issues, Fixes, Keywords, Reports, Settings), site switcher at top, user menu. Mobile: bottom nav or drawer.
- Settings pages: profile, account name, delete account (soft-delete + scheduled hard delete after 30 days via a job placeholder).
- Emails via Resend (EMAIL_PROVIDER env) with React Email templates: verify email, reset password.
- Rate limit auth routes (10/min/IP) with Upstash Ratelimit or a Redis-based limiter.
- Audit log entries for login, password change, account deletion.
- UI: clean, plain, accessible (WCAG AA), no generic AI-looking gradients. Neutral palette with one accent colour. Font: IBM Plex Sans (self-hosted via next/font), not Inter.

Acceptance checks:
- Sign up → verify email (log the link in dev) → land on empty /app dashboard.
- Google sign-in works with test credentials.
- Playwright e2e test for signup, login, logout, reset password.
```

## Prompt 3 — Sites, verification and onboarding wizard

```
Build site onboarding (REQUIREMENTS 2.1):
- "Add site" wizard, 4 steps: URL → verify ownership → connect platform (skippable, show "coming next" for connectors not built yet) → business questionnaire.
- Normalise URLs (https, lowercase host, strip trailing slash); reject IPs, localhost and private ranges.
- Verification methods: DNS TXT `seo-agent-verify=<token>`, HTML file `/seo-agent-<token>.html`, or Search Console (implemented in Prompt 6; show it disabled until then). "Check now" button + background re-check every 10 minutes for 24h.
- Enforce: max sites = subscription quantity (trial = 1 site). Unverified sites can be audited but not fixed.
- Business questionnaire fields exactly as REQUIREMENTS 2.1, stored in business_profiles, editable later in Settings → Business.
- Dashboard empty states that explain the next step.

Acceptance checks:
- Unit tests for URL normalisation and private-IP rejection (include 127.0.0.1, 10.x, 169.254.169.254, [::1], decimal/hex IP tricks).
- DNS and HTML-file verification tested with mocked resolvers/fetch.
- e2e: add site → questionnaire saved → appears in site switcher.
```

## Prompt 4 — Job queue and worker foundation

```
Set up background jobs in apps/worker with BullMQ + Redis (REDIS_URL):
- Queues: crawl, analyse, audit, apply, verify, ranks, gsc-sync, reports, notifications, maintenance.
- Shared job helpers in packages/shared/jobs.ts: typed job payloads (zod), enqueue functions callable from web (uses the same Redis), idempotency via jobId, retries 3 with exponential backoff, dead-letter handling (failed jobs recorded in a `job_failures` table with error + payload).
- Concurrency: crawl 4 global / 1 per site; apply 1 per site (use BullMQ group or a Redis lock per site).
- Scheduler (BullMQ repeatable jobs): weekly crawl per active site, daily ranks, daily gsc-sync, monthly reports, hourly site-up checks, nightly maintenance (delete expired data, hard-delete accounts past 30 days).
- Graceful shutdown, health endpoint on the worker (/health), Sentry for errors.
- Bull Board (or similar) mounted in the admin area only.

Acceptance checks:
- Test job enqueued from web is processed by worker; a failing job retries 3 times then lands in job_failures.
- Two apply jobs for the same site never run at the same time (test with a lock).
```

## Prompt 5 — Crawler

```
Implement the crawler in packages/audit (REQUIREMENTS 2.3) and run it from the crawl queue:
- SSRF-safe fetcher: resolve DNS, block private/reserved/link-local/metadata IPs (IPv4+IPv6), re-validate on every redirect, only http/https, max 10 redirects, 20s timeout, 5 MB body cap, our user agent from env.
- robots.txt parsing for our UA (use robots-parser), sitemap + sitemap index parsing (gzip too).
- Frontier: BFS from sitemap + homepage, same registrable domain (use tldts), normalise URLs (remove fragments, sort known tracking params out), respect plan page limit.
- Politeness: 2 concurrent per domain, 500ms delay, honour Retry-After, back off on 429/503.
- Extraction with cheerio: every field listed in REQUIREMENTS 2.3; main text with @mozilla/readability (via linkedom/jsdom); content hash (sha256 of normalised main text + title + meta).
- JS rendering fallback with Playwright (chromium) when body text < 200 chars or a known SPA shell is detected; reuse one browser per worker; block images/fonts/media in rendering.
- Persist pages + page_snapshots; update crawl progress every 20 pages (UI polls or uses SSE).
- Incremental: if content hash unchanged, mark page "unchanged" so analysis is skipped.
- Crawl UI: start crawl button (respect manual crawl limit), live progress, cancel.

Acceptance checks:
- Fixture tests with a local test server (in tests) covering: robots disallow, redirect chain, 404, canonical, noindex header, JS-rendered page, sitemap index, infinite calendar links (stops via limit/depth).
- SSRF tests: redirect to 169.254.169.254 is blocked.
- Crawl of a real 50-page site completes and shows pages in a table.
```

## Prompt 6 — Google Search Console + GA4

```
Add Google integrations in packages/integrations (REQUIREMENTS 2.2):
- Separate Google OAuth flow for data access (not the login flow), scopes webmasters.readonly and analytics.readonly, offline access, refresh tokens encrypted in integrations table.
- After connect: list GSC properties, auto-match to the site (domain property or URL-prefix), let user confirm. Matching property also verifies site ownership (enable that option in Prompt 3's wizard).
- gsc-sync job: last 16 months on first sync (chunked by month), then daily for the last 3 days (GSC data lags). Dimensions: date, page, query. Store in gsc_daily. Handle row limits (25k per request, paginate with startRow).
- GA4: list properties, user picks one; daily sync of sessions and key events per landing page (Data API runReport).
- Token refresh + "Reconnect Google" banner on invalid_grant. Disconnect deletes tokens.
- Dashboard cards: clicks, impressions, CTR, average position (28 days vs previous 28), top pages, top queries, "almost ranking" queries (position 8–20, ≥50 impressions).

Acceptance checks:
- Mocked API tests for pagination and token refresh.
- Real connection works with your own GSC property in dev.
```

## Prompt 7 — Audit rule engine + health score

```
Implement the audit engine in packages/audit (REQUIREMENTS 2.4):
- Rule interface exactly: { id, category, severity, impact, effort, fixableByAgent, detect(page, siteContext) => Finding[] }. siteContext gives access to all pages, link graph, sitemap URLs, GSC index data if available.
- Implement all checks listed in 2.4 (~70). Group rules in files by category. Near-duplicate detection with simhash on main text.
- Audit job runs after each crawl: computes findings, upserts issues (open), resolves issues no longer found (fixed, with resolved_at), records health score per REQUIREMENTS formula, stores breakdown.
- Priority score and "Top 10 to fix" list.
- Issues UI: filter by severity/category/status, issue detail with affected pages, "ignore" with reason, plain-English explanation (call the issue_explainer prompt from Prompt 8 later — for now show the rule's static description).

Acceptance checks:
- Every rule has a positive and negative fixture test (`pnpm --filter audit test` shows ≥140 tests).
- Health score test: one critical issue on 1 of 100 pages can't drop score below 80; score is deterministic.
```

## Prompt 8 — AI layer (OpenRouter)

```
Build packages/ai exactly as described in docs/AGENT_PROMPTS.md "How every call works":
- OpenRouter client (fetch, no SDK lock-in): models array for fallback, json_schema response_format, usage include, timeout 60s, retries with backoff on 429/5xx.
- Prompt registry: one file per prompt in packages/ai/prompts/ with id, version, tier, system, user template function, zod output schema, code-level checks function. Implement ALL prompts from AGENT_PROMPTS.md sections 0–12 now (13–17 later).
- Shared preamble is prepended automatically. Data is wrapped in the tags shown; escape any closing tags inside data.
- Budget guard: before each call compute month-to-date llm cost for the site; refuse over LLM_BUDGET_PER_SITE_USD; alert at 60%.
- Cache table llm_cache(key, output_json, created_at) keyed by hash(prompt id+version+model+input); TTL 30 days.
- Log every call to llm_calls with cost from OpenRouter usage.
- Validation retry: once, with the zod error appended; then fail.
- Eval harness: `pnpm eval <promptId>` runs fixtures in packages/ai/evals/<promptId>/*.json and checks constraints (lengths, injection ignored, no invented numbers). Add at least 5 fixtures per prompt, including a prompt-injection fixture.
- Hook issue_explainer into the Issues UI (cached per rule + language).

Acceptance checks:
- Unit tests with mocked OpenRouter for: fallback model used on primary failure, invalid JSON → retry → fail, budget exceeded → no call made, cache hit → no call made.
- `pnpm eval title_meta` passes with a real API key.
```

## Prompt 9 — Fix engine, approval queue, change log, rollback

```
Build the agent fix engine (REQUIREMENTS 2.5):
- analyse job: for each open issue where fixableByAgent=true and the page changed or has no fix yet, call the matching prompt (title_meta, alt_text, heading_fix, json_ld, internal_links, redirect_map) and create fixes with before/after/reason/confidence/risk. Batch by page to save tokens.
- Risk rules in code (packages/shared/fix-policy.ts): high = redirects, canonical, anything touching indexing; medium = confidence <0.7, JSON-LD, internal links; low = alt text, meta description with confidence ≥0.8. High risk can never be auto-approved.
- Hard safety limits in code: no delete operations exist in any connector interface; max 50 applies per run, 200 per day per site.
- Fixes UI: tabs Proposed / Approved / Applied / Rejected / Failed; each card shows page, before → after diff, reason, risk badge; actions approve, edit+approve, reject with reason, bulk approve (low+medium only), filter by type/risk.
- Auto-approve rules per site (Settings → Automation), default off, only for allowed low-risk types.
- apply job: through the Connector interface (packages/connectors/types.ts):
    read(target) -> current value
    apply(fix) -> { ok, platformResponse }
    rollback(changeLogEntry) -> { ok }
    verify(fix) -> { live: boolean, observedValue }
  Before apply: read current value; if it differs from fix.before → status conflict. After apply: write change_log; enqueue verify after 2 min and 10 min.
- Rollback per fix and per batch; conflict detection the same way.
- Manual connector: shows copy-paste instructions and "Mark as done".
- Implement a FakeConnector for tests and local dev.

Acceptance checks:
- Tests with FakeConnector: apply, verify, rollback restores exact old value; conflict prevents apply; daily limit enforced; high-risk never auto-approved.
- e2e: proposed title fix → approve → applied (fake) → rollback.
```

## Prompt 10 — WordPress connector + companion plugin

```
Build wordpress-plugin/seo-agent-connector (PHP 8.0+, WordPress 6.0+) and packages/connectors/wordpress:
Plugin:
- Settings page: shows site connection status and a one-time connect code; admin enters connect code from our app OR our app uses an Application Password created by the admin.
- REST namespace seo-agent/v1, all routes require auth (Application Password user with manage_options) AND an HMAC-SHA256 signature header over body+timestamp (shared secret created at connect; reject >5 min old).
- Routes: GET /info (WP version, active SEO plugin, post types), GET /resolve?url= (url → post/term/attachment id + type), GET/POST /seo-meta (title, description for posts, pages, CPTs, terms), GET/POST /image-alt, GET/POST /h1 (only replaces the first H1 in post_content via the block parser; supports Gutenberg and classic), GET/POST /json-ld, POST /internal-link (inserts <a> around an exact existing phrase, once), GET/POST/DELETE /redirect (own table; use Redirection plugin API if active), GET/POST /canonical.
- SEO plugin adapters: Yoast (_yoast_wpseo_title/_yoast_wpseo_metadesc and term meta option), Rank Math (rank_math_title/rank_math_description), SEOPress (_seopress_titles_title/_seopress_titles_desc), AIOSEO (its aioseo_posts table via its API/models). No SEO plugin → own meta keys + wp_head output (title via pre_get_document_title).
- JSON-LD and own meta are printed in wp_head; dedupe with active SEO plugin output where possible.
- Every write returns previous value. Uninstall keeps applied changes (own meta stays printed only if user opts in; document this).
- Coding standards: WPCS, nonces where applicable, capability checks, sanitize/escape everything, no direct DB writes except own redirect table.
Connector:
- Implements the Connector interface using these routes; maps our fix types to routes.
Also: zip build script for the plugin and a test matrix doc.

Acceptance checks:
- wp-env (or Docker WordPress) test setup; integration tests for Yoast, Rank Math and no-SEO-plugin sites: title/meta/alt/redirect apply + rollback.
- Requests without valid HMAC are rejected (403).
```

## Prompt 11 — Keywords and rank tracking (DataForSEO)

```
Implement keywords in packages/integrations/dataforseo and the Keywords UI (REQUIREMENTS 2.7):
- DataForSEO client with basic auth from env; record cost of every request in a data_calls table (endpoint, cost, site).
- Keyword research: keyword_expand prompt → DataForSEO Labs (keyword ideas/suggestions, search volume, bulk keyword difficulty, search intent) for the site's location/language → store keywords. Location codes from DataForSEO locations endpoint (cache it).
- Clustering by SERP overlap (fetch top-10 SERP once per keyword, queued/standard mode for cost), ≥4 shared URLs = same cluster.
- keyword_page_map prompt for mappings + cannibalisation.
- Rank tracking: daily SERP checks (task_post in standard queue + pingback or tasks_ready polling) for tracked keywords, desktop and mobile, site location; store position, ranking URL, SERP features.
- UI: tracked keywords table (position, change 1d/7d/30d, URL, volume), add/remove tracked keywords (plan limit 100), research view with "track" button, almost-ranking list from GSC, cannibalisation warnings.

Acceptance checks:
- Mocked API tests for task_post/tasks_ready flow and cost logging.
- Daily cost for 100 keywords × 2 devices logged and ≤ the limit in REQUIREMENTS.
```

## Prompt 12 — Stripe billing and plan limits

```
Add billing (REQUIREMENTS 2.13):
- Stripe Checkout for subscription with quantity = number of sites, prices from env (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY), 7-day trial, Stripe Tax automatic, allow promotion codes.
- Customer Portal link in Settings → Billing.
- Webhook route with signature verification and idempotency (store processed event ids): sync subscriptions table and account status.
- Adding a site beyond quantity → prompt to increase quantity (subscription update with proration).
- Plan limits in packages/shared/plans.ts enforced in one function `assertWithinLimit(accountId, siteId, limitKey)` used by: crawl start, keyword tracking, drafts, competitors, AI prompts, LLM budget.
- Payment failed → banner + email; after 7 days past due → pause scheduled jobs (no data loss).
- Cancel → active until period end → read-only → data deleted after 30 days (maintenance job).

Acceptance checks:
- Stripe CLI webhook tests for create, update quantity, payment failed, cancel.
- Limit tests for every limit key.
```

## Prompt 13 — Reports, notifications and dashboard polish

```
Implement reports and notifications (REQUIREMENTS 2.12):
- Dashboard final version: health score + 90-day trend chart, GSC 28d vs previous, ranking movement summary, fixes applied this month, top 5 next actions (from priority list), integration status.
- Monthly report job (1st of month, site timezone): gather metrics, call monthly_report prompt, enforce number check from AGENT_PROMPTS.md, render email (React Email) + PDF (Playwright print of a /reports/[id]/print route), store in object storage (S3/R2), list in Reports page.
- Notifications: email templates + triggers for: fixes awaiting approval (daily digest), critical issue found, site down (3 failed checks 5 min apart), traffic drop >30% week over week, integration disconnected, payment failed. One-click unsubscribe per type (signed link). In-app notification bell.

Acceptance checks:
- Snapshot tests for each email template.
- Report generation test with fixture metrics; number check rejects a hallucinated number.
```

## Prompt 14 — Free audit tool + marketing site

```
Build the public marketing site in apps/web (route group (marketing)):
- Landing page: clear headline about fixing SEO issues with approval, how it works (3 steps), what it fixes, price ($49/site), comparison table vs typical tools (no competitor trademarks in logos), FAQ, CTA.
- Free audit tool: URL input + Cloudflare Turnstile → crawl max 20 pages (separate low-priority queue, 5/hour/IP limit) → show score + top 5 issues; full report requires email (creates a lead) → signup CTA.
- Pricing page, /bot page (who we are, how to block us, contact), legal pages (Terms, Privacy, DPA, Cookies) with placeholder text clearly marked TODO-LEGAL.
- SEO for our own site: metadata, sitemap.xml, robots.txt, OG images, JSON-LD (Organization, SoftwareApplication, FAQPage only where visible).
- Design: distinctive, not template-looking: real product screenshots, specific copy, no purple gradients, no generic 3-card icon rows.

Acceptance checks:
- Lighthouse ≥ 95 performance/accessibility/SEO on landing page.
- Free audit abuse test: 6th request in an hour from same IP gets 429.
```

## Prompt 15 — Admin panel

```
Build /admin (REQUIREMENTS 2.15), only for users with ADMIN_EMAILS from env + 2FA (TOTP) required:
- Accounts and sites search; detail page with plan, usage, llm/data cost this month, margin, failed jobs, integration status, audit log.
- Actions: impersonate (banner + audit log + auto-expire 30 min), re-run job, extend trial, refund last invoice via Stripe, disable account.
- Metrics page: MRR, active sites, trials, trial→paid %, churn (30d), avg cost per site, gross margin; daily spend chart (LLM + DataForSEO).
- Bull Board for queues.

Acceptance checks:
- Non-admin gets 404 on every /admin route (test).
- Impersonation is logged and expires.
```

## Prompt 16 — Shopify connector

```
Build the Shopify connector (REQUIREMENTS 2.6):
- Shopify app (Remix template is not needed; implement OAuth in apps/web) installable as a custom/unlisted app first. Scopes: read_products, write_products, read_content, write_content, read_online_store_navigation, write_online_store_navigation, read_themes.
- GDPR mandatory webhooks (customers/data_request, customers/redact, shop/redact) and app/uninstalled.
- Admin GraphQL (pinned API version in env): resolve URL → resource (product, collection, page, article); read/write `seo { title description }`; image alt via product media update; redirects via urlRedirectCreate/urlRedirectDelete; JSON-LD via a theme app extension (app embed block) that prints JSON from a shop/resource metafield we write.
- Respect GraphQL cost-based rate limits (read throttleStatus, wait accordingly).
- Implements the Connector interface incl. rollback and verify.

Acceptance checks:
- Works on a Shopify development store: title/meta/alt/redirect apply + rollback.
- Uninstall webhook disables the integration and deletes tokens.
```

## Prompt 17 — GitHub and Webflow connectors

```
GitHub connector:
- GitHub App (contents: write, pull_requests: write, metadata: read), installation flow, repo + branch selection per site.
- Detect framework: plain HTML, Next.js App Router (metadata/generateMetadata exports), Astro (frontmatter/Layout props). Map a page URL to its source file.
- Apply = commit changes on branch seo-agent/<yyyy-mm-dd> and open/update one PR per batch with a table of changes; status "applied" only when PR is merged (webhook pull_request.closed merged=true). Rollback = open a revert PR.
- Unsupported framework → PR adding SEO-AGENT-FIXES.md with instructions.
- Use AST edits (ts-morph for TS/JS, an HTML parser for .html), never regex on source.
Webflow connector:
- OAuth app, Data API v2: pages (SEO/OG title & description), CMS collection items for template pages, then publish site. Rollback with stored values.

Acceptance checks:
- GitHub: fixture repos (html, next, astro) → PR contains correct edits; tests for URL→file mapping.
- Webflow: works on a test site.
```

## Prompt 18 — Google Business Profile + page optimisation

```
- GBP: OAuth scope business.manage (feature-flagged until Google API access is approved), list accounts/locations, match to site, sync profile data, gbp_suggestions prompt, show suggestions as tasks (manual apply in v1, owner copies or clicks "open in Google").
- NAP consistency check (site footer/contact, JSON-LD, GBP) as audit rules.
- Page optimisation: for pages with a mapped keyword and impressions, fetch top-10 SERP + PAA, call page_optimise, run fact_guard on drafts, show as "content suggestions" (approval required; WordPress connector inserts as a draft revision, not live).

Acceptance checks:
- fact_guard blocks a draft with an invented price in tests.
- GBP feature hidden when flag is off.
```

## Prompt 19 — Hardening, security and launch readiness

```
Production hardening:
- Security headers (CSP with nonces, HSTS, X-Frame-Options DENY, Referrer-Policy), CSRF checks on mutations, input validation with zod on every route/server action.
- Rate limits on all public and authenticated APIs per REQUIREMENTS.
- Secrets audit: no secrets in client bundles (add a CI check grepping the built client output for env names).
- Tenant isolation test suite across every route handler (call each with another account's ids → 404).
- Observability: Sentry (web + worker) with release tags, structured logs (pino), queue backlog and failure-rate alerts, daily spend alert.
- Backups: document Neon/Supabase PITR settings; write a restore runbook in docs/RUNBOOK.md and test it.
- Data export (JSON/CSV zip) and account deletion pipeline verified end to end.
- Load test: 200 sites scheduled crawl in one night on the worker sizing you choose; document results and required instance sizes.
- docs/DEPLOY.md: Vercel (web), Railway/Fly (worker with Playwright image), Neon/Supabase, Upstash/Railway Redis, R2, Stripe live, Google OAuth verification steps, Shopify app listing steps.

Acceptance checks:
- `pnpm test`, e2e suite and eval suite all green in CI.
- Launch checklist in REQUIREMENTS section 7 has every box ticked or a written reason.
```

---

## v2 prompts (after launch)

**Prompt 20 — Autopilot + impact tracking**
```
Add weekly/monthly autopilot per site using auto-approve rules only; add per-fix impact (GSC page metrics 28d before vs after, shown on the fix card and in reports). Never auto-apply high risk.
```

**Prompt 21 — Content briefs and drafts**
```
Implement content_brief, content_draft and fact_guard flows (AGENT_PROMPTS 13–15), drafts limit per plan, [OWNER:] placeholder blocking, publish to WordPress/Shopify/Webflow as draft only, content calendar view.
```

**Prompt 22 — AI search visibility**
```
Track up to 20 prompts per site across AI engines via DataForSEO AI Optimization/LLM Mentions endpoints; store ai_mentions; trend chart; competitor share of mentions; ai_visibility_advice suggestions; optional llms.txt generator (manual apply).
```

**Prompt 23 — Competitors and backlinks**
```
Competitor tracking (3 per site): shared/gap keywords, new pages from their sitemaps; backlinks monitoring (summary, new/lost referring domains, anchors) via DataForSEO Backlinks; local citation suggestions. Monitoring only, no outreach automation.
```

**Prompt 24 — Teams and agency plan**
```
Multi-account membership, roles (owner/editor/viewer/client), invitations, agency plan with white-label (logo, colours, custom domain via CNAME + automatic TLS), client portal with approve-only access, bulk actions across sites, white-label reports.
```

**Prompt 25 — Agent chat**
```
Implement agent_chat (AGENT_PROMPTS 17) with tool calling over the site's data, streaming responses, conversation history per site, propose_fix creating proposed fixes only.
```
