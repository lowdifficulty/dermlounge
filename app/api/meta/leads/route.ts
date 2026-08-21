import { NextResponse } from "next/server";
import {
  metaWebhookChallenge,
  parseLeadgenNotifications,
  verifyMetaSignature,
} from "@/lib/meta/webhook";
import { ingestLeadgenId } from "@/lib/meta/leads";
import { writeMetaRuntimeConfig } from "@/lib/meta/config";
import { processMetaMessagingWebhookPayload } from "@/lib/meta/messaging-webhook";

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

  let dmResult = { processed: 0, skipped: 0 };
  try {
    dmResult = await processMetaMessagingWebhookPayload(
      payload as Parameters<typeof processMetaMessagingWebhookPayload>[0]
    );
  } catch (err) {
    console.error("Meta messaging webhook failed:", err);
  }

  const notifications = parseLeadgenNotifications(payload);
  const results = [];
  const errors: string[] = [];
  for (const item of notifications) {
    try {
      results.push(await ingestLeadgenId(item.leadgenId));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "ingest failed";
      console.error("Meta lead ingest failed:", item.leadgenId, err);
      errors.push(`${item.leadgenId}: ${reason}`);
      results.push({
        leadgenId: item.leadgenId,
        created: false,
        updated: false,
        skipped: true,
        reason,
      });
    }
  }

  try {
    await writeMetaRuntimeConfig({
      lastWebhookAt: new Date().toISOString(),
      lastWebhookCount: notifications.length,
      lastError: errors[0] || null,
    });
  } catch (err) {
    console.error("Could not persist Meta webhook status:", err);
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, count: results.length, results, errors, dm: dmResult },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, count: results.length, results, dm: dmResult });
}
