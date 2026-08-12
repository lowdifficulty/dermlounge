import { NextResponse } from "next/server";
import { crmPublicBaseUrl } from "@/lib/crm/public-url";
import { buildClientOutboundTwiml } from "@/lib/notifications/twilio-voice";
import { normalizePhoneE164 } from "@/lib/notifications/twilio";
import { getTwilioVoiceCallerId } from "@/lib/notifications/twilio-client";

async function handle(request: Request) {
  let toRaw = "";
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      toRaw =
        formData.get("To")?.toString() ||
        formData.get("to")?.toString() ||
        formData.get("Called")?.toString() ||
        "";
    } catch {
      /* ignore */
    }
  }
  if (!toRaw) {
    const url = new URL(request.url);
    toRaw = url.searchParams.get("To") || url.searchParams.get("to") || "";
  }

  const customer = normalizePhoneE164(toRaw.replace(/^client:/, ""));
  if (!customer) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Sorry, we could not connect that call.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  const callerId = normalizePhoneE164((await getTwilioVoiceCallerId()) || "");
  if (callerId && customer === callerId) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Cannot call the business line from the dialer.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  const base = await crmPublicBaseUrl(request);
  const twiml = await buildClientOutboundTwiml(
    customer,
    `${base}/api/twilio/voice/status`
  );

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
