# DermLounge Static Mirror

Next.js 15 app that serves a static mirror of [mydermlounge.com](https://www.mydermlounge.com) via a catch-all route, with Core Web Vitals optimizations and a contact form API.

## Quick start

```bash
npm install
npm run mirror          # scrape HTML from live site
npm run postmirror      # rewrite URLs, CWV tweaks, contact patch
node scripts/download-assets.mjs   # optional: cache wp-content assets locally
npm run dev             # http://localhost:3000
```

For production:

```bash
npm run build
npm start
```

`prebuild` automatically runs `postmirror` when `mirror/html` exists.

## Architecture

| Path | Purpose |
|------|---------|
| `mirror/html/` | Mirrored HTML pages (one `index.html` per route) |
| `mirror/manifest.json` | Route list from last mirror run |
| `public/assets/wp-content/` | Downloaded WordPress assets |
| `app/[[...slug]]/route.ts` | Serves mirrored HTML for any path |
| `app/api/contact/route.ts` | Contact form POST handler |

## Tracking

The mirrored HTML includes the same third-party tags as the live site:

| Service | ID / URL | Notes |
|---------|----------|-------|
| **Google Tag Manager** | `GTM-W8M568D9` | In `<head>` on all pages |
| **Trustindex** | `cdn.trustindex.io/loader.js` | Google reviews widget; deferred in post-processing |
| **Meta Pixel** | — | Not present in raw HTML; check GTM container for pixel tags |

Constants live in `lib/site-config.ts`.

## Contact form

The Breakdance form on `/contact-us/` (form ID **113**) is patched at build time to POST JSON to `/api/contact` instead of WordPress `admin-ajax.php`.

| Field | Required | Maps to |
|-------|----------|---------|
| Name | Yes | `fname` |
| Email | Yes | `email` |
| Mobile | No | `pnumber` |
| Service | Yes | `services` |
| Message | Yes | `message` |
| HP Name (honeypot) | — | `hpname` — if filled, API returns 200 silently |

See [INTEGRATION.md](./INTEGRATION.md) for CRM/email setup.

## Booking widget

Appointment links and the embedded iframe use:

```
https://d2oe0ra32qx05a.cloudfront.net/?practiceKey=k_1_105850
```

Defined as `BOOKING_IFRAME_URL` in `lib/site-config.ts`.

## Mirror workflow

1. Place (or generate) `wp-pages.json` and `wp-posts.json` at project root — WordPress REST exports with `link` fields.
2. `npm run mirror` — fetches each URL, discovers extra URLs from `sitemap_index.xml`, writes HTML and `mirror/manifest.json`. Rate-limited to 200 ms between requests.
3. `npm run postmirror` — rewrites `wp-content` URLs to `/assets/wp-content/…`, strips ShortPixel CDN wrappers, removes Breeze prefetch, defers Trustindex, adds `fetchpriority="high"` on the first post-header hero image, injects contact form patch.
4. `node scripts/download-assets.mjs` — downloads referenced assets into `public/assets/`.

Temp scrape files at project root (`home.html`, `contact.html`, `wp-*.json`) are gitignored.

## Environment variables

Create `.env.local` for email delivery:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
CONTACT_TO=info@mydermlounge.com
CONTACT_FROM=noreply@yourdomain.com
```

Without SMTP vars, submissions are logged to the server console and still return success to the user.

## Deploy (Vercel)

1. Push repo to GitHub.
2. Import in Vercel; framework preset **Next.js**.
3. Run mirror + asset download locally, commit `mirror/html`, `public/assets`, and `mirror/manifest.json`, **or** run mirror in CI before build.
4. Set SMTP env vars in Vercel project settings.
5. Deploy — `vercel.json` sets long-cache headers for `/assets/*`.

## CWV optimizations (post-processing)

- Remove Breeze link-prefetch script (reduces main-thread work)
- Defer/async Trustindex loader
- `fetchpriority="high"` on first hero image after header
- ShortPixel CDN URLs rewritten to local `/assets/wp-content/` paths after asset download
