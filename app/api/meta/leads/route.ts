import { NextResponse } from "next/server";
import {
  metaWebhookChallenge,
  parseLeadgenNotifications,
  verifyMetaSignature,
} from "@/lib/meta/webhook";
import { ingestLeadgenId } from "@/lib/meta/leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const challenge = await metaWebhookChallenge(request);
  if (challenge == null) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature =
    request.headers.get("x-hub-signature-256") ||
    request.headers.get("X-Hub-Signature-256");
  if (!(await verifyMetaSignature(raw, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const notifications = parseLeadgenNotifications(payload);
  const results = [];
  for (const item of notifications) {
    try {
      results.push(await ingestLeadgenId(item.leadgenId));
    } catch (err) {
      console.error("Meta lead ingest failed:", item.leadgenId, err);
      results.push({
        leadgenId: item.leadgenId,
        created: false,
        updated: false,
        skipped: true,
        reason: err instanceof Error ? err.message : "ingest failed",
      });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}
