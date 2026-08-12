# DermLounge QA checklist

Use this before promoting changes to production or after refreshing the static mirror. The app is a Next.js mirror of [mydermlounge.com](https://www.mydermlounge.com) until the full AI stack migration replaces it.

## Prerequisites

- Node.js 20+ (project tested on current LTS; Vercel uses 24.x)
- Dependencies: `npm install`
- Optional email testing: copy env vars into `.env.local` (see below)

## Local commands

| Step | Command | Notes |
|------|---------|--------|
| Refresh HTML from live site | `npm run mirror` | Needs `wp-pages.json` / `wp-posts.json` at repo root when applicable |
| Post-process mirror | `npm run postmirror` | URL rewrites, CWV tweaks, contact form patch |
| Cache WordPress assets | `node scripts/download-assets.mjs` | Populates `public/assets/wp-content/` |
| Dev server | `npm run dev` | http://localhost:3000 |
| Production build | `npm run build` | Runs `prebuild` (postmirror + bundle-css) when `mirror/html` exists |
| Start production locally | `npm start` | After build |
| Full local refresh | `npm run 67` | Same as Mobile Dog Salon pattern: build + ensure localhost |

After `npm run build`, `postbuild` runs `ensure-local` (skipped in CI) and restarts **http://localhost:3000** with the latest production build.

## Health checks (local)

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/about/
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/contact-us/
```

Expect `200` for mirrored routes. If localhost is down after a build: `npm run ensure-local`.

## Production / staging URLs

| Environment | URL |
|-------------|-----|
| Vercel production | https://dermlounge.vercel.app |
| Live reference | https://www.mydermlounge.com |

Compare key pages (home, contact, a service page, booking iframe) between mirror and live when validating a mirror refresh.

## Core Web Vitals / Lighthouse

Run against local production server (`npm run build` then `npm start`) or against https://dermlounge.vercel.app:

- **PageSpeed Insights:** https://pagespeed.web.dev/analysis?url=https://dermlounge.vercel.app
- **Chrome DevTools → Lighthouse** (mobile + desktop) on `/`, `/contact-us/`, and one long service URL

Post-mirror optimizations are documented in [README.md](../README.md#cwv-optimizations-post-processing).

## Contact form (`/api/contact`)

1. Open http://localhost:3000/contact-us/ (or production URL).
2. Submit with all required fields; confirm success UI.
3. With SMTP configured, confirm email arrives at `CONTACT_TO`.
4. Without SMTP, check server logs for `[contact] Email not configured — logging submission:`.

**API smoke test (JSON):**

```powershell
curl.exe -s -X POST http://localhost:3000/api/contact `
  -H "Content-Type: application/json" `
  -d "{\"fname\":\"QA Test\",\"email\":\"qa@example.com\",\"services\":\"Hydrafacial\",\"message\":\"Automated QA ping\",\"hpname\":\"\"}"
```

Expect JSON `{ "success": true, ... }`. Honeypot: send non-empty `hpname` and expect silent success without delivery.

Field mapping and CRM notes: [INTEGRATION.md](../INTEGRATION.md).

## Environment variables checklist

Set in `.env.local` (local) and Vercel project **dermlounge** (production). Do not commit secrets.

| Variable | Required for email | Purpose |
|----------|-------------------|---------|
| `SMTP_HOST` | Yes | Outbound mail host |
| `SMTP_PORT` | Yes | Usually `587` or `465` |
| `SMTP_USER` | Yes | SMTP auth user |
| `SMTP_PASS` | Yes | SMTP auth password |
| `CONTACT_TO` | No | Inbox (default `info@mydermlounge.com`) |
| `CONTACT_FROM` | No | From address (defaults to SMTP user) |

## Mirror diff sanity

- Spot-check GTM (`GTM-W8M568D9`) and booking iframe URL in `lib/site-config.ts`.
- Confirm `mirror/manifest.json` route count matches expectations after `npm run mirror`.
- Verify `/assets/*` responses return long-cache headers on Vercel (see `vercel.json`).

## Repo / deploy (reminder)

- GitHub: https://github.com/lowdifficulty/dermlounge
- Vercel project name: **dermlounge** (CLI deploy; not auto-linked to Git push unless you connect the repo in Vercel dashboard)
- Commit mirrored HTML/assets before deploy if the build must match latest scrape
