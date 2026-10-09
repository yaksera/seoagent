# SEO Agent

Enter a website, get a plain-English SEO audit and AI-written fixes you can paste straight in.

This is the **MVP** of the product described in `docs/`. It's built to show to real business owners and pre-sell before building the full version.

## What it does now
- Crawls up to 50 pages (sitemap + internal links, respects robots.txt, polite speed).
- Runs 23 checks: noindex, broken pages, server errors, redirect chains, canonicals, titles, meta descriptions, duplicates, H1s, thin content, alt text, mobile viewport, language, structured data, sitemap, orphan pages, HTTPS.
- Health score 0–100 and problems sorted by severity, with the affected pages.
- "Suggest fixes" on any page: new title, meta description and H1 from OpenRouter, with an alternative, a reason, copy buttons, and code checks for length, duplicates and invented numbers.
- Blocks requests to private/internal addresses (SSRF protection) and limits audits per IP.

Not yet built: accounts, database, Search Console, applying fixes to WordPress/Shopify, billing. See `docs/BUILD_PROMPTS.md` for the full plan.

## Run it
```bash
npm install
cp .env.example .env.local   # then add your OPENROUTER_API_KEY
npm run dev
```
Open http://localhost:3000.

Audits are saved as JSON files in `data/audits/` (git-ignored).

## Scripts
- `npm run dev`: development server
- `npm run build && npm start`: production
- `npm test`: unit tests (SSRF protection, crawler parsing, audit rules)
- `npm run typecheck`

## Cost
Crawling is free. Each "Suggest fixes" call uses one cheap model request (usually well under $0.01). Results are cached per page, so clicking again costs nothing.

## Project docs
| File | What it is |
|---|---|
| `docs/REQUIREMENTS.md` | Full product spec (v1 + v2) |
| `docs/BUILD_PROMPTS.md` | Step-by-step build prompts for the full product |
| `docs/AGENT_PROMPTS.md` | Runtime AI prompts with output schemas |
| `docs/env.full.example` | Environment variables for the full product |
| `CLAUDE.md` | Rules for AI coding agents working on this repo |
