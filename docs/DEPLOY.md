# Deploying SEO Agent

The app is one Node.js process: the Next.js web server plus the background worker (audits, Search Console syncs, emails, cleanup). The worker needs a long-running server, so use **Railway, Render, Fly.io or a VPS**, not serverless/Vercel.

## 1. Database (Neon, free tier works)
1. Create a project at neon.tech and copy the connection string.
2. Set `DATABASE_URL=postgres://...?sslmode=require`. Migrations run automatically on start.
3. Turn on point-in-time restore / daily backups in Neon.

Without `DATABASE_URL` the app uses PGlite in `./data/pglite`. That is fine for local development and a single small server with a persistent disk, but use Postgres for production.

## 2. Environment variables
Copy `.env.example`. Required in production:

| Variable | Notes |
|---|---|
| `APP_URL` | Your public URL, e.g. `https://app.example.com` (used in emails, OAuth and Stripe redirects) |
| `DATABASE_URL` | Postgres connection string |
| `ENCRYPTION_KEY` | 32 random bytes, base64. Back it up: losing it means reconnecting every WordPress and Google integration |
| `ADMIN_EMAILS` | Your email; that account sees `/admin` |
| `OPENROUTER_API_KEY` | AI fixes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Verify your sending domain in Resend |
| `CRAWLER_USER_AGENT` | e.g. `SEOAgentBot/1.0 (+https://app.example.com/bot)` |

Optional: `STRIPE_*`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MODEL_CHEAP`, `MODEL_FALLBACK`, `LLM_BUDGET_PER_SITE_USD`, `WORKER_CONCURRENCY`.

## 3. Deploy
**Railway / Render:** connect the GitHub repo, they detect the `Dockerfile`. Set the env vars, health check path `/api/health`, port 3000.

**Any server with Docker:**
```bash
docker build -t seo-agent .
docker run -d --env-file .env.production -p 3000:3000 --restart unless-stopped seo-agent
```
Put it behind HTTPS (Caddy, Nginx, or the platform's TLS).

Scaling later: run more web instances with `WORKER_ENABLED=false` and keep one or more worker instances with it on. Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so several workers are safe.

## 4. Stripe
1. Create a product "SEO Agent – per website" with two recurring prices: $49/month and $490/year.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`.
3. Add a webhook endpoint `https://YOUR_DOMAIN/api/stripe/webhook` with events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Set `STRIPE_WEBHOOK_SECRET`.
4. In Stripe settings, enable the Customer Portal (cancel, update card, invoices, change quantity).
5. Optional: enable Stripe Tax and set `STRIPE_AUTOMATIC_TAX=true`.
6. Test locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## 5. Google Search Console
1. Google Cloud Console → new project → enable **Google Search Console API**.
2. OAuth consent screen: External, add scope `.../auth/webmasters.readonly`, add your privacy policy and terms URLs.
3. Credentials → OAuth client ID (Web): authorised redirect URI `https://YOUR_DOMAIN/api/google/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. While in "Testing" mode only listed test users can connect. Submit for verification before public launch (webmasters.readonly is a sensitive scope; Google review can take a few weeks).

## 6. WordPress plugin
The plugin is in `wordpress-plugin/seo-agent-connector` and served as `public/seo-agent-connector.zip`. After editing it, rebuild the zip:
```powershell
Compress-Archive -Path wordpress-plugin\seo-agent-connector -DestinationPath public\seo-agent-connector.zip -Force
```
Test it on a real site with Yoast, one with Rank Math and one with no SEO plugin before launch.

## 7. Before launch checklist
- [ ] Legal pages (`/terms`, `/privacy`) reviewed and your business details added
- [ ] Support/abuse emails on `/bot`, `/terms`, `/privacy` replaced
- [ ] `ENCRYPTION_KEY` backed up somewhere safe
- [ ] Database backups on and one restore tested
- [ ] Stripe live keys + webhook tested with a real card, then refunded
- [ ] Resend domain verified (SPF/DKIM) so emails don't land in spam
- [ ] Uptime monitor on `/api/health`
- [ ] Admin login works; non-admins get 404 on `/admin`
