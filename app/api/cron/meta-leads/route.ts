import { NextResponse } from "next/server";
import { resolveMetaPageAccessToken, resolveMetaPageId } from "@/lib/meta/config";
import { syncRecentMetaLeads } from "@/lib/meta/leads";
import { subscribePageToLeadgen } from "@/lib/meta/subscribe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorizedCron(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

async function runCron(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pageId = await resolveMetaPageId();
  const token = await resolveMetaPageAccessToken();
  if (!pageId || !token) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Meta Page ID or access token is not configured",
    });
  }

  try {
    await subscribePageToLeadgen();
  } catch (err) {
    console.error("Meta leadgen subscribe during cron failed:", err);
  }

  try {
    const result = await syncRecentMetaLeads(72);
    return NextResponse.json({ ok: true, source: "cron", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meta cron sync failed";
    console.error("Meta lead cron failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  return runCron(request);
}
