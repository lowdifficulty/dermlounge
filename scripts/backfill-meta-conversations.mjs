/**
 * Backfill Meta Messenger / Instagram DMs into CRM (last 7 days by default).
 *
 * Usage:
 *   npm run backfill-meta
 *   npm run backfill-meta -- --days=7
 */

const BASE = (process.env.LOCAL_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const ADMIN_USER = process.env.SCHEDULING_ADMIN_USER || "1";
const ADMIN_PASSWORD = process.env.SCHEDULING_PASSWORD || "1";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = daysArg ? Number(daysArg.split("=")[1]) : 7;

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const legacy = res.headers.get("set-cookie");
  const cookies = [...setCookie, legacy].filter(Boolean);
  return { res, json, cookies };
}

function mergeCookies(existing, newCookies) {
  const jar = new Map();
  for (const part of (existing || "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k && v) jar.set(k, v);
  }
  for (const c of newCookies) {
    const first = c.split(";")[0];
    const [k, v] = first.split("=");
    if (k && v) jar.set(k.trim(), v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const login = await request("/api/auth/login/", {
  method: "POST",
  body: { username: ADMIN_USER, password: ADMIN_PASSWORD },
});

if (!login.res.ok) {
  console.error("Admin login failed:", login.json?.error ?? login.res.status);
  console.error(`Is ${BASE} running? Try: npm run ensure-local`);
  process.exit(1);
}

const cookie = mergeCookies("", login.cookies);
const backfill = await request("/api/admin/meta/", {
  method: "POST",
  cookie,
  body: {
    action: "backfill-dm",
    days: Number.isFinite(days) ? days : 7,
  },
});

console.log(JSON.stringify(backfill.json, null, 2));
if (!backfill.res.ok || !backfill.json?.ok) process.exit(1);
