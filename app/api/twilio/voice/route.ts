import { NextResponse } from "next/server";
import { ensureCrmSeeded } from "@/lib/crm/seed";
import { recordInboundCall } from "@/lib/crm/messaging";
import { buildInboundVoiceTwiml } from "@/lib/notifications/twilio-voice";

/** Twilio Voice webhook — inbound calls to the business number. */
export async function POST(request: Request) {
  const formData = await request.formData();
  const from = formData.get("From")?.toString() ?? "";
  const callSid = formData.get("CallSid")?.toString();

  try {
    await ensureCrmSeeded();
    if (from) {
      await recordInboundCall({ from, twilioSid: callSid });
    }
  } catch (err) {
    console.error("Inbound voice CRM log failed:", err);
  }

  const twiml = await buildInboundVoiceTwiml();
  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}
