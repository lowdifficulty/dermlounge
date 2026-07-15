# Contact Form Integration Guide

This document explains how the DermLounge contact form works in the static mirror and how to connect it to your CRM or email workflow.

## Overview

The live site uses a **Breakdance** form (builder ID `330-113`, form element `#contact-form113`) that submits to WordPress `admin-ajax.php`. The mirror replaces that behavior with a client-side patch that POSTs JSON to **`/api/contact`**.

The patch is injected by `scripts/process-html.mjs` into any page containing the contact form (currently `/contact-us/`).

## Request format

**Endpoint:** `POST /api/contact`  
**Content-Type:** `application/json`

```json
{
  "fname": "Jane Doe",
  "email": "jane@example.com",
  "pnumber": "7145551234",
  "services": "Hydrafacial",
  "message": "I'd like to schedule an appointment.",
  "hpname": ""
}
```

### Field reference

| JSON key | Original form name | Required | Description |
|----------|-------------------|----------|-------------|
| `fname` | `fields[fname]` | Yes | Full name |
| `email` | `fields[email]` | Yes | Valid email address |
| `pnumber` | `fields[pnumber]` | No | Phone number |
| `services` | `fields[services]` | Yes | Selected service (dropdown) |
| `message` | `fields[message]` | Yes | Free-text message |
| `hpname` | `fields[hpname]` | Honeypot | Must be empty; bots get silent 200 |

### Service options (must match form dropdown)

- Hydrafacial
- Ultherapy
- Botox
- Dermal Fillers
- Laser Hair Removal
- Picosure Laser Skin Treatment
- Thermage
- Zo Skin Health
- Morpheus8 Microneedling
- Valmont Facial Treatments
- IPL Photofacial
- Needle-Free Hydration Treatment
- Bojin Meridian Facial
- Hydrafacial Keravive
- Oxygen Bubble Facial

## Response format

**Success (200):**

```json
{
  "success": true,
  "message": "Your message has been received!"
}
```

**Validation error (400):**

```json
{
  "success": false,
  "message": "Please fill in all required fields."
}
```

**Server error (500):**

```json
{
  "success": false,
  "message": "Something went wrong. Please try again."
}
```

**Honeypot triggered (200):** Same shape as success; no email sent, no console log of PII.

## Email delivery (Nodemailer)

When SMTP environment variables are set, `app/api/contact/route.ts` sends a plain-text email:

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | Port (default `587`) |
| `SMTP_USER` | Auth username |
| `SMTP_PASS` | Auth password |
| `CONTACT_TO` | Recipient (default `info@mydermlounge.com`) |
| `CONTACT_FROM` | From address (default `SMTP_USER` or `noreply@mydermlounge.com`) |

Email subject: `DermLounge contact — {services}`  
Reply-To: submitter's email

### Example `.env.local`

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxx
CONTACT_TO=info@mydermlounge.com
CONTACT_FROM=contact@yourdomain.com
```

## CRM integrations

### Option A — Email forwarding (simplest)

Point `CONTACT_TO` at your team inbox or a CRM inbound address (HubSpot, Salesforce Email-to-Case, etc.).

### Option B — Webhook middleware

Replace or extend `sendContactEmail()` in `app/api/contact/route.ts`:

```typescript
async function forwardToCrm(data: ContactPayload) {
  await fetch(process.env.CRM_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRM_API_KEY}`,
    },
    body: JSON.stringify({
      first_name: data.fname,
      email: data.email,
      phone: data.pnumber,
      service_interest: data.services,
      notes: data.message,
      source: "dermlounge-website",
    }),
  });
}
```

### Option C — Zapier / Make

1. Create a Zap with **Webhooks by Zapier → Catch Hook**.
2. Add a fetch call in the API route to the Zap URL.
3. Map fields to Gmail, Slack, HubSpot, etc.

## Client-side behavior

The injected script (`#dermlounge-contact-patch`):

1. Listens for `submit` in **capture** phase (runs before Breakdance handlers).
2. Matches forms with ID containing `113`.
3. Prevents default Breakdance AJAX submission.
4. POSTs JSON to `/api/contact`.
5. Shows inline success/error message and resets the form on success.

To change the target form ID, update `CONTACT_FORM_ID` in `lib/site-config.ts` and the patch selector in `scripts/process-html.mjs`, then re-run `npm run postmirror`.

## Testing locally

```bash
npm run dev
```

Open `http://localhost:3000/contact-us/` and submit the form. Without SMTP configured, check the terminal for logged JSON.

### cURL smoke test

```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d "{\"fname\":\"Test\",\"email\":\"test@example.com\",\"services\":\"Botox\",\"message\":\"Hello\"}"
```

## Security notes

- Honeypot field `hpname` filters naive bots without revealing failure.
- No reCAPTCHA in the mirrored form (matches live site config); add server-side rate limiting or Turnstile if abuse occurs.
- Validate and sanitize before forwarding to external CRMs.
- Do not commit `.env.local` or SMTP credentials.

## Re-mirror checklist

After updating the live contact form:

1. `npm run mirror`
2. `npm run postmirror`
3. Verify `#dermlounge-contact-patch` is present in `mirror/html/contact-us/index.html`
4. Test submission end-to-end
