import { NextResponse } from "next/server";
import {
  processMetaMessagingWebhookPayload,
  verifyMetaMessagingWebhookChallenge,
  verifyMetaMessagingSignature,
} from "@/lib/meta/messaging-webhook";
import { writeMetaRuntimeConfig } from "@/lib/meta/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const challenge = await verifyMetaMessagingWebhookChallenge(request);
  if (challenge) return challenge;
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-hub-signature-256") ||
    request.headers.get("X-Hub-Signature-256");

  if (!(await verifyMetaMessagingSignature(rawBody, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processMetaMessagingWebhookPayload(
      payload as Parameters<typeof processMetaMessagingWebhookPayload>[0]
    );
    await writeMetaRuntimeConfig({
      lastWebhookAt: new Date().toISOString(),
      lastWebhookCount: result.processed,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Meta messaging webhook failed:", err);
    return NextResponse.json({ ok: true, processed: 0, skipped: 0 });
  }
}
