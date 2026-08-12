import { NextResponse } from "next/server";
import { buildBridgeTwiml } from "@/lib/notifications/twilio-voice";
import { normalizePhoneE164 } from "@/lib/notifications/twilio";

async function handle(request: Request) {
  const url = new URL(request.url);
  let customer = url.searchParams.get("customer");
  if (!customer && request.method === "POST") {
    try {
      const formData = await request.formData();
      customer = formData.get("customer")?.toString() || customer;
    } catch {
      /* ignore */
    }
  }

  const e164 = normalizePhoneE164(customer || "");
  if (!e164) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we could not connect that call.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  return new NextResponse(await buildBridgeTwiml(e164), {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
