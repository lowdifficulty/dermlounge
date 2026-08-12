import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { readTwilioRuntimeConfig } from "@/lib/notifications/twilio-runtime-config";
import { twilioStatus } from "@/lib/notifications/twilio-client";

/** Staff/groomer dialer — callback phone default and Twilio readiness. */
export async function GET() {
  try {
    await requireStaff();
    const [runtime, status] = await Promise.all([
      readTwilioRuntimeConfig(),
      twilioStatus(),
    ]);
    const staffCallbackNumber =
      runtime.staffCallbackNumber?.trim() ||
      process.env.TWILIO_STAFF_CALLBACK_NUMBER?.trim() ||
      "";
    return NextResponse.json({
      staffCallbackNumber,
      configured: Boolean(staffCallbackNumber),
      voiceReady: status.configured && status.hasVoice,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
