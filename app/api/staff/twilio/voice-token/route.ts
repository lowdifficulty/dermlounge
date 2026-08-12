import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { createStaffVoiceAccessToken } from "@/lib/twilio/voice-access-token";

/** Short-lived Twilio Voice JS SDK access token for browser calling. */
export async function GET() {
  try {
    const user = await requireStaff();
    const result = await createStaffVoiceAccessToken(user);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, browserCalling: false }, { status: 400 });
    }
    return NextResponse.json({
      token: result.token,
      identity: result.identity,
      browserCalling: true,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
