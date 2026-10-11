# SEO Agent

An SEO and AI-search agent for small businesses: it scores a website for Google and for AI assistants (ChatGPT, Claude, Perplexity, Google AI Overviews), explains every problem in plain English, writes fixes, and publishes the ones you approve to WordPress, with rollback. $49 per website per month.

## Features
**For customers**
- Free 20-page audit from the home page, no account needed
- Sign up with a 7-day trial: email verification, password reset, settings, account deletion
- Sites dashboard with health scores; full audits (up to 500 pages) run in the background and repeat weekly
- 23 checks: indexing, broken pages, redirects, titles, descriptions, headings, thin content, alt text, mobile, structured data, sitemap, HTTPS
- AI-written title, meta description and H1 per page (OpenRouter), validated in code
- WordPress connector plugin: publish fixes in one click, conflict check, rollback
- Google Search Console: clicks, impressions, top searches, keywords close to page one
- **AI readiness score** (0–100, 20 checks): which AI crawlers robots.txt allows, content without JavaScript, llms.txt, structured data, freshness, identity, agent standards, with copy-ready fixes
- **Brand Memory**: confirmed business facts that every AI output must stick to
- **AI Feed**: generated llms.txt, Organization/LocalBusiness JSON-LD and FAQ markup, published via the WordPress plugin with rollback
- **AI visibility tracking**: weekly checks of whether web-connected AI answers mention or cite the business
- Stripe billing per site (monthly/yearly), customer portal
- Email alerts when a site gets worse, monthly reports, trial reminders

**For you (`/admin`)**
- Revenue (MRR), paying accounts, trials, sign-ups, audits, AI cost per site
- Accounts: search, details, "view as user" support sessions, extend trial, disable
- Audits, background jobs (with retry), AI usage by model, full activity log

**Under the hood**
- Next.js 16, TypeScript, Tailwind, Drizzle ORM, Postgres (PGlite locally, zero setup)
- Postgres job queue with retries and a scheduler, running inside the app
- SSRF-safe crawler, encrypted integration credentials (AES-256-GCM), scrypt passwords, rate limits, security headers
- Monthly AI budget per site, every AI call logged with cost
- Data retention and permanent deletion 30 days after an account is closed

## Run locally
```bash
npm install
cp .env.example .env.local
```
Fill in `.env.local`. At minimum set `ADMIN_EMAILS` (your email), `ENCRYPTION_KEY` (the command is in the file) and `OPENROUTER_API_KEY` for AI fixes. Then:
```bash
npm run dev
```
Open http://localhost:3000, sign up with the admin email, and `/admin` appears in the menu. Emails print to the terminal until you add a Resend key.

Stripe, Google and Resend are optional locally; each page tells you what's missing.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Development server (web + worker) |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit tests + database tests on in-memory Postgres |
| `npm run typecheck` | TypeScript |
| `npm run db:generate` | Create a migration after changing `lib/db/schema.ts` |

## Deploy
See [docs/DEPLOY.md](docs/DEPLOY.md): Neon + Railway/Render/Docker, Stripe, Google OAuth, WordPress plugin, launch checklist.

## Project layout
| Path | What's there |
|---|---|
| `app/` | Pages and API routes: public site, `(auth)`, `app/` (customer dashboard), `admin/` |
| `lib/crawler.ts`, `lib/rules.ts` | Crawler and audit checks |
| `lib/fixes.ts`, `lib/openrouter.ts` | AI suggestions, validation, budget and cost logging |
| `lib/wordpress.ts`, `wordpress-plugin/` | WordPress publishing and the connector plugin |
| `lib/google.ts`, `lib/google-insights.ts` | Search Console sync and reports |
| `lib/jobs.ts`, `lib/worker.ts` | Job queue and scheduler |
| `lib/notifications.ts`, `lib/maintenance.ts` | Emails and data retention |
| `lib/db/` | Schema and database connection; migrations in `drizzle/` |
| `docs/` | Requirements, build plan, AI prompts, deploy guide |
