# SEO Agent — Product Requirements (v1 + v2)

Working name: **SEO Agent** (set `APP_NAME` in `.env`).
Price: **$49 per website per month**, $490 per year. Free audit, 7-day trial.
Customer: small business owners and freelancers with WordPress, Shopify, Webflow or code-based sites. Later: agencies.

Promise: "We find what's hurting your site in Google, fix it with your approval, and show you what changed." Never promise rankings.

Legend: **[v1]** must ship at launch · **[v2]** first months after launch · **AC** = acceptance criteria.

---

## 1. Users, roles and accounts

| Role | Can do |
|---|---|
| Owner | Everything, including billing and deleting the account |
| Editor [v2] | Approve/reject fixes, edit settings, view reports |
| Viewer [v2] | View dashboard and reports only |
| Client [v2, agency] | Approve fixes and view reports for assigned sites, no billing |
| Admin (internal) | Admin panel, impersonation (logged) |

- An **account** (organisation) owns sites, a subscription and members.
- A user can belong to several accounts [v2]; in v1 one user = one account.

---

## 2. Functional requirements

### 2.1 Auth and onboarding [v1]
- Email + password signup with email verification; Google sign-in; password reset; session expiry 30 days; logout on all devices.
- Onboarding wizard, max 4 steps: add site URL → verify ownership → connect publishing platform (can skip) → business questionnaire.
- Ownership verification, any one of: DNS TXT record `seo-agent-verify=<token>`; HTML file at `/seo-agent-<token>.html`; Google Search Console property match.
- Business questionnaire: business name, type/category, primary location (city, country) or "online only", services (up to 10), up to 3 competitor URLs, up to 10 seed keywords, preferred tone (friendly/professional/technical), language.
- A free audit starts automatically after the URL is entered (limited to 50 pages before payment).
- **AC:** a new user reaches a dashboard showing a health score in under 5 minutes for a 50-page site; an unverified site cannot have fixes applied.

### 2.2 Integrations [v1 unless noted]

| Integration | Purpose | Access |
|---|---|---|
| Google Search Console | Clicks, impressions, queries, positions, index status | OAuth, `webmasters.readonly` |
| Google Analytics 4 | Sessions, conversions per page | OAuth, `analytics.readonly` |
| WordPress | Apply fixes | Companion plugin + Application Password |
| Shopify | Apply fixes | Shopify app (custom/unlisted first), Admin GraphQL API |
| Webflow | Apply fixes | OAuth app, Data API v2 |
| GitHub | Apply fixes as pull requests | GitHub App (contents + pull requests write) |
| Google Business Profile | Local SEO | OAuth `business.manage` (needs Google API access approval — apply early) |
| DataForSEO | SERPs, keywords, backlinks, AI mentions | API login/password, server-side only |
| PageSpeed Insights [v2] | Core Web Vitals | API key |
| OpenRouter | All LLM calls | API key, server-side only |
| Stripe | Billing, tax | Secret key + webhooks |
| Resend/Postmark | Email | API key |

- Tokens are encrypted at rest (AES-256-GCM with a key from env/KMS), never sent to the browser, refreshed automatically, and the user sees "Reconnect" when one expires.
- **AC:** disconnecting an integration deletes its stored tokens within one minute.

### 2.3 Crawler [v1]
- Sources: `sitemap.xml` (and sitemap index), homepage, internal links. Max depth 10. Same registrable domain only (subdomains configurable).
- Respect `robots.txt` for our user agent `SEOAgentBot/1.0 (+https://<domain>/bot)`.
- Fetch with plain HTTP first; render with Playwright when the HTML body is near-empty or a JS framework shell is detected.
- Politeness: max 2 concurrent requests per domain, 500 ms delay default, back off on 429/503, timeout 20 s per page.
- Per page store: URL, final URL, status, redirect chain, content hash, title, meta description, meta robots, X-Robots-Tag, canonical, hreflang, OG/Twitter tags, H1–H3, word count, main text (boilerplate removed), internal/external links with anchor text, images (src, alt, size, dimensions), JSON-LD blocks, response time, page size, lang attribute.
- Incremental crawl: skip LLM analysis when the content hash is unchanged.
- Plan limit: 500 pages ($49 plan); stop and report "limit reached".
- **AC:** a 500-page WordPress site crawls in under 15 minutes; a crawl can be cancelled; a crashed crawl resumes from its queue.

### 2.4 Technical audit [v1]
- Rule engine with ~70 deterministic checks (no LLM needed to detect). Each rule has: `id`, `category`, `severity` (critical/warning/info), `impact` (1–5), `effort` (1–5), `detect(page, site)`, `fixable_by_agent` (bool), plain-English template.
- Categories and example checks:
  - **Indexing:** noindex on important page, blocked by robots.txt, canonical to another URL, canonical to 404/redirect, page not in sitemap, sitemap URL returns non-200, GSC "not indexed" reasons.
  - **Status:** 4xx, 5xx, redirect chains (>1 hop), redirect loops, internal links to redirects/404s.
  - **On-page:** missing/duplicate/too long (>60 chars)/too short (<30) title; missing/duplicate/too long (>160)/too short (<70) meta description; missing/multiple H1; H1 equals title exactly (info); empty headings; skipped heading levels (info).
  - **Content:** thin content (<200 words on indexable pages), near-duplicate pages (simhash), missing internal links to page (orphan).
  - **Images:** missing alt, alt >125 chars, images >300 KB, missing width/height.
  - **Structured data:** missing LocalBusiness/Organization on home, missing Product on product pages, invalid JSON-LD, missing required properties.
  - **Security/tech:** not HTTPS, mixed content, missing viewport, missing lang, missing favicon (info).
  - **International:** hreflang without return link, invalid language codes.
- Health score 0–100: weighted by severity × pages affected, capped per rule so one issue can't zero the score. Store daily for trends.
- Priority = `impact × pages_affected_factor / effort`; dashboard shows top 10.
- [v2] Pattern checks across templates ("all 40 product pages share one meta description").
- **AC:** every rule has a unit test with a fixture page that triggers it and one that doesn't.

### 2.5 Agent: fixes, approval, apply, rollback [v1]
- For each fixable issue, generate a **Fix**: `type`, target (page/resource ID in the platform), `before` value, `after` value, reason (plain English), confidence (0–1), risk (low/medium/high).
- Fix types v1: title, meta description, alt text, H1/heading text, JSON-LD block, internal link insertion, 301 redirect for 404, canonical tag.
- **Approval queue:** list with filters (type, risk, page); approve, edit then approve, reject (with reason, stored to improve prompts), bulk approve; auto-approve rules per site for low-risk types (default OFF).
- **Hard safety rules (enforced in code, not only in prompts):**
  - Never delete content, pages or products.
  - Never change URLs/slugs, robots meta, robots.txt or canonical to a different domain without explicit per-fix approval (risk = high, never auto-approved).
  - Max 50 applied changes per site per run; max 200 per day.
  - Skip if the live value differs from the stored `before` value (someone edited it) — mark "conflict".
- **Apply:** via connector; record `applied_at`, platform response, and the exact previous value.
- **Rollback:** one click per fix or per batch; restores the stored previous value; if live value changed since, show conflict instead of overwriting.
- **Verification:** re-fetch the page after apply (and after cache delay, 10 min) and confirm the change is live.
- **Manual mode** (no connector): show copy-paste instructions and mark as "done by me".
- [v2] Autopilot schedule (weekly/monthly) honoring auto-approve rules.
- [v2] Impact tracking: GSC clicks/impressions/CTR/position for the page 28 days before vs after, shown on each fix.
- [v2] Agent chat over the site's data (tools: query GSC, query pages, query issues, propose fix).
- **AC:** an approved title fix on WordPress is live within 2 minutes and rollback restores the exact old value; a fix with a `before` mismatch is never applied.

### 2.6 Connectors (publishing)
- **WordPress [v1]:** companion plugin `seo-agent-connector`:
  - Registers authenticated REST routes under `/wp-json/seo-agent/v1/`.
  - Reads/writes SEO title & meta description through Yoast, Rank Math, SEOPress or All in One SEO if installed; otherwise stores in its own post meta and prints the tags in `<head>`.
  - Updates image alt (attachment `_wp_attachment_image_alt`), post content headings, internal links (inserts a link into existing text only), JSON-LD (stores per post, prints in head), redirects (own table, or Redirection plugin if present), canonical.
  - Auth: WordPress Application Password scoped to an admin user, plus HMAC signature header.
  - Uninstall leaves applied changes in place.
- **Shopify [v1, late]:** products, collections, pages, articles: `seo { title description }`; image alt via media update; redirects via `urlRedirectCreate`; JSON-LD via a theme app extension (app embed) reading metafields. Scopes: `read/write_products`, `read/write_content`, `read/write_online_store_navigation`, `read_themes`.
- **Webflow [v1, late]:** static page SEO/OG fields via Pages API; CMS item fields for collection pages; publish after update.
- **GitHub [v1, late]:** GitHub App opens a PR per batch on a branch `seo-agent/<date>`; supported: plain HTML files, Next.js App Router `metadata` exports, Astro frontmatter. Unsupported frameworks get a PR adding `SEO-AGENT-FIXES.md` with instructions.
- [v2] Wix, Squarespace, Framer (API where available, otherwise manual mode).

### 2.7 Keywords and rankings [v1]
- Keyword research from seeds + questionnaire + GSC queries: volume, difficulty, CPC, intent (informational/commercial/transactional/navigational), via DataForSEO Labs.
- Clustering by SERP overlap (keywords sharing ≥4 of top-10 URLs = same cluster).
- Rank tracking: daily, desktop + mobile, location-specific (city or country), top 100 positions, ranking URL, SERP features present.
- "Almost ranking" list: GSC queries at average position 8–20 with ≥50 impressions/28 days, sorted by opportunity.
- Keyword → page mapping; cannibalisation warning when 2+ pages get impressions for the same query and swap positions.
- [v2] Competitor tracking (3 competitors): shared keywords, gap keywords, new pages.
- [v2] SERP features tracking incl. AI Overviews, local pack, featured snippet.
- **AC:** 100 tracked keywords cost ≤ $0.10/day in DataForSEO queued mode.

### 2.8 Content [v1 optimise, v2 create]
- [v1] Page optimisation: compare a page against the current top-10 results for its mapped keyword (headings, subtopics, length, questions) and suggest additions/rewrites as fixes.
- [v2] Content briefs, article drafts (2/month on $49), refresh suggestions for decaying pages, content calendar.
- Rules: every draft needs approval; no invented facts, prices, reviews, stats or quotes; flag claims needing a source; no doorway or mass city pages.

### 2.9 Local SEO [v1 basic]
- Connect Google Business Profile; suggest primary/secondary categories, description, services, attributes, photo count targets.
- NAP consistency check across site footer/contact page, JSON-LD and GBP.
- [v2] Review reply drafts (approval required), review request link/QR, GBP post drafts.

### 2.10 AI search visibility [v2]
- Track 20 prompts per site across ChatGPT, Perplexity, Gemini, Google AI Overviews (DataForSEO AI Optimization / LLM Mentions); record whether the brand is mentioned/cited and which competitors are.
- Recommendations: entity clarity (About, Organization schema, sameAs), FAQ blocks, factual summaries, `llms.txt`.

### 2.11 Backlinks [v2, monitoring only]
- Referring domains count, new/lost links, anchor distribution, toxic-pattern warning, local directory/citation suggestions. No link buying or automated outreach.

### 2.12 Reports and notifications [v1]
- Dashboard: health score + trend, GSC clicks/impressions (28d vs previous), ranking movement, fixes applied this month, top 5 next actions.
- Monthly report (email + PDF): plain-English summary written by the report prompt, numbers from the database only.
- Emails: fixes awaiting approval (daily digest max), critical issue found, site down (3 failed checks 5 min apart), traffic drop >30% week over week, integration disconnected, payment failed.
- [v2] White-label PDF/email for agencies, Slack/WhatsApp, per-user notification settings.

### 2.13 Billing and limits [v1]
- Stripe Billing: one subscription per account, quantity = number of sites; monthly $49/site, yearly $490/site; 7-day trial with card; Stripe Tax; Customer Portal for card/invoices/cancel.
- Webhooks: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Idempotent handling.
- Plan limits enforced server-side (see table). Over limit → block the action with an upgrade message, never silently drop work.
- Cancel: access until period end; data kept 30 days then deleted; applied fixes stay on the site.

| Limit per site | $49 plan |
|---|---|
| Pages crawled | 500 |
| Scheduled crawl | Weekly (+2 manual crawls/month) |
| Tracked keywords | 100, daily |
| Fixes | Unlimited, approval required |
| Content drafts [v2] | 2/month |
| Competitors [v2] | 3 |
| AI search prompts [v2] | 20 |
| LLM budget (internal cap) | $5/month, alert at $3 |

### 2.14 Agencies [v2]
- Agency plan (e.g. $399/month for 15 sites), white-label (logo, colours, custom domain via CNAME), client portals, bulk actions, per-client reports.

### 2.15 Admin panel [v1]
- Search accounts/sites; view plan, usage, LLM + data cost, margin per site, failed jobs, integration status.
- Actions: impersonate (logged + banner), re-run job, extend trial, refund (via Stripe), disable account.
- Metrics: MRR, active sites, trial→paid conversion, churn, average cost per site, gross margin.

### 2.16 Marketing site [v1]
- Landing page, pricing, free audit tool (URL → 20-page mini audit + score, email to see full report; rate-limited, captcha via Cloudflare Turnstile), comparison pages, docs, blog, legal pages, bot info page.

---

## 3. Non-functional requirements

### Security [v1]
- Tenant isolation: every query scoped by `account_id`; Postgres RLS or a mandatory scoped repository layer + tests proving cross-tenant access fails.
- Secrets only in env/secret manager; integration tokens encrypted; no secrets in logs.
- CSRF protection, secure cookies, rate limits (auth 10/min/IP, API 120/min/user, free audit 5/hour/IP).
- SSRF protection on the crawler: block private/internal IP ranges, metadata IPs, non-http(s) schemes; re-check after redirects/DNS resolution.
- Prompt-injection defence: crawled text is data only; wrapped in delimiters; model output validated by schema; agent can only perform whitelisted fix types.
- Dependency scanning, security headers (CSP, HSTS), audit log of sensitive actions.

### Reliability and performance
- Job queue with retries (3, exponential backoff), dead-letter queue, idempotency keys, per-site concurrency 1 for apply jobs.
- Dashboard p95 < 800 ms; background work never in request handlers.
- Daily DB backups, point-in-time recovery, restore tested monthly.
- Staging environment mirroring production.

### Cost control
- Every LLM/DataForSEO call logged with cost, site, account, feature.
- Per-site monthly budget enforced before each call; cheap model by default.
- Cache LLM results by `(prompt_version, input_hash)`.

### Observability
- Sentry (web + worker), structured JSON logs, uptime monitor, alerts for queue backlog >15 min, job failure rate >5%, daily spend > threshold.

### Privacy and legal
- GDPR: DPA, data export (JSON/CSV), deletion within 30 days, EU data region option later.
- Google API Services User Data Policy compliance; complete OAuth verification for sensitive scopes before public launch.
- Terms forbid using the product on sites you don't own/manage.

### Accessibility and UX
- WCAG 2.1 AA, keyboard usable, plain-English copy (no jargon without a tooltip), mobile-friendly approval queue.

---

## 4. Data model (Postgres)

```
accounts(id, name, stripe_customer_id, plan, status, created_at)
users(id, email, name, password_hash, email_verified_at, created_at)
memberships(account_id, user_id, role)
sites(id, account_id, url, domain, name, platform, verified_at, verification_token, settings_json, created_at)
business_profiles(site_id, business_name, category, city, country, services[], competitors[], seed_keywords[], tone, language)
integrations(id, site_id, provider, status, encrypted_credentials, scopes, expires_at, last_error)
crawls(id, site_id, status, trigger, pages_found, pages_crawled, started_at, finished_at, error)
pages(id, site_id, url, canonical_url, status_code, content_hash, title, meta_description, h1, word_count, indexable, last_crawled_at, platform_ref_json)
page_snapshots(id, page_id, crawl_id, data_json)          -- full extracted data per crawl
issues(id, site_id, page_id, rule_id, severity, status[open|fixed|ignored], first_seen_at, resolved_at, details_json)
fixes(id, site_id, page_id, issue_id, type, target_ref_json, before_value, after_value, reason, confidence, risk,
      status[proposed|approved|applying|applied|failed|rejected|rolled_back|conflict], approved_by, approved_at,
      applied_at, verified_at, error, prompt_version, llm_call_id)
change_log(id, fix_id, action[apply|rollback], previous_value, new_value, platform_response_json, created_at, actor)
keywords(id, site_id, keyword, location_code, language, volume, difficulty, intent, cluster_id, mapped_page_id, tracked)
rank_checks(id, keyword_id, device, checked_at, position, url, serp_features[])
gsc_daily(site_id, date, page, query, clicks, impressions, ctr, position)
health_scores(site_id, date, score, breakdown_json)
reports(id, site_id, period, summary_md, pdf_url, sent_at)
subscriptions(account_id, stripe_subscription_id, status, quantity, interval, current_period_end, trial_end)
usage(site_id, month, pages_crawled, keywords_tracked, llm_cost_usd, data_cost_usd, drafts_used)
llm_calls(id, site_id, feature, prompt_id, prompt_version, model, input_tokens, output_tokens, cost_usd, latency_ms, input_hash, status, created_at)
notifications(id, account_id, type, payload_json, sent_at, read_at)
audit_log(id, account_id, user_id, action, target, metadata_json, ip, created_at)
gbp_locations(id, site_id, location_name, data_json, synced_at)                 -- v1 basic
ai_mentions(id, site_id, engine, prompt, mentioned, cited_url, competitors[], checked_at)   -- v2
```

---

## 5. Architecture

- **apps/web** — Next.js (App Router) on Vercel: UI, API routes, auth, Stripe webhooks, OAuth callbacks.
- **apps/worker** — Node service on Railway/Fly/Render (needs Playwright + long jobs): BullMQ workers for crawl, audit, analyse, apply, verify, ranks, gsc-sync, reports, notifications, scheduler.
- **packages/db** — Drizzle schema, migrations, scoped repositories.
- **packages/audit** — crawler extraction + rule engine (pure functions, heavily tested).
- **packages/ai** — OpenRouter client, prompt registry, schemas (Zod), budget guard, cache.
- **packages/connectors** — WordPress, Shopify, Webflow, GitHub with one interface: `read(target)`, `apply(fix)`, `rollback(changeLog)`, `verify(fix)`.
- **packages/integrations** — GSC, GA4, GBP, DataForSEO, PageSpeed.
- **wordpress-plugin/** — PHP companion plugin.
- Postgres (Neon or Supabase), Redis (Upstash or Railway), object storage (R2/S3) for PDFs and snapshots.

---

## 6. Environment variables
See `.env.example`.

## 7. Launch checklist
- [ ] Google OAuth app verified for GSC/GA4 scopes (GBP access approved or feature hidden)
- [ ] Stripe live mode, tax registrations, webhooks verified
- [ ] WordPress plugin tested on Yoast, Rank Math, SEOPress, no-SEO-plugin sites
- [ ] Shopify app installed on a dev store + one real store
- [ ] SSRF, tenant isolation and rollback tests passing in CI
- [ ] Cost per site measured on 10 real sites (target ≤ $13/month)
- [ ] Legal pages, DPA, bot info page live
- [ ] Backups restored once successfully
- [ ] Free audit tool rate limits and captcha on
