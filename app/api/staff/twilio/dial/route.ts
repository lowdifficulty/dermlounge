import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { crmPublicBaseUrl } from "@/lib/crm/public-url";
import { ensureContactForPhone, recordOutboundCall } from "@/lib/crm/messaging";
import { startOutboundBridgeCall } from "@/lib/notifications/twilio-voice";

/** Click-to-call bridge for staff and groomers. */
export async function POST(request: Request) {
  try {
    const user = await requireStaff();
    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      staffPhone?: string;
    };
    const to = body.to?.trim();
    if (!to) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    const base = await crmPublicBaseUrl(request);
    const result = await startOutboundBridgeCall({
      customerPhone: to,
      staffPhone: body.staffPhone?.trim(),
      twimlUrl: `${base}/api/twilio/voice/bridge`,
      statusCallbackUrl: `${base}/api/twilio/voice/status`,
    });

    const contact = await ensureContactForPhone(to);
    await recordOutboundCall({
      contact,
      staffUserId: user.email || user.name,
      staffName: user.name,
      twilioSid: result.sid,
      summary: result.ok
        ? "Outbound dialer call started"
        : `Outbound call failed: ${result.error}`,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || "Call failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, sid: result.sid });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
