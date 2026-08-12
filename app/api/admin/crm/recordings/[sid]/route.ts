import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { getTwilioClient } from "@/lib/notifications/twilio-client";
import { resolveTwilioAccountSid } from "@/lib/notifications/twilio-runtime-config";

type Params = { params: Promise<{ sid: string }> };

/** Stream a Twilio call recording for admin CRM playback (recordings require auth). */
export async function GET(_request: Request, { params }: Params) {
  try {
    await requireStaff();
    const { sid } = await params;
    if (!sid.startsWith("RE")) {
      return NextResponse.json({ error: "Invalid recording" }, { status: 400 });
    }

    const client = await getTwilioClient();
    const accountSid = await resolveTwilioAccountSid();
    if (!client || !accountSid) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
    }

    const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

    let authHeader: string | null = null;
    if (apiKeySid && apiKeySecret) {
      authHeader = `Basic ${Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64")}`;
    } else if (accountSid && authToken) {
      authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
    }

    if (!authHeader) {
      return NextResponse.json({ error: "Twilio credentials missing" }, { status: 503 });
    }

    const recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;
    const upstream = await fetch(recordingUrl, {
      headers: { Authorization: authHeader },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Recording not found" }, { status: upstream.status });
    }

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
