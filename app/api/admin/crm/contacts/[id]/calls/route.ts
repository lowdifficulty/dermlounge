import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { findContactById } from "@/lib/crm/store";
import { recordOutboundCall } from "@/lib/crm/messaging";
import { crmPublicBaseUrl } from "@/lib/crm/public-url";
import { startOutboundBridgeCall } from "@/lib/notifications/twilio-voice";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const contact = await findContactById(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { staffPhone?: string };
    const base = await crmPublicBaseUrl(request);
    const result = await startOutboundBridgeCall({
      customerPhone: contact.phoneE164 || contact.phone,
      staffPhone: body.staffPhone,
      twimlUrl: `${base}/api/twilio/voice/bridge`,
      statusCallbackUrl: `${base}/api/twilio/voice/status`,
    });

    const interaction = await recordOutboundCall({
      contact,
      staffUserId: user.email || user.name,
      staffName: user.name,
      twilioSid: result.sid,
      summary: result.ok
        ? "Outbound click-to-call started"
        : `Outbound call failed: ${result.error}`,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Call failed", interaction },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, sid: result.sid, interaction });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
