import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { ensureContactForPhone, recordOutboundCall } from "@/lib/crm/messaging";
import { findContactById } from "@/lib/crm/store";
import { normalizePhoneE164 } from "@/lib/notifications/twilio";

/** Log a browser Voice SDK outbound call to CRM once the client leg connects. */
export async function POST(request: Request) {
  try {
    const user = await requireStaff();
    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      callSid?: string;
      contactId?: string;
    };

    const to = normalizePhoneE164(body.to || "");
    const callSid = body.callSid?.trim();
    if (!to) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    const contact =
      (body.contactId ? await findContactById(body.contactId) : null) ||
      (await ensureContactForPhone(to));

    await recordOutboundCall({
      contact,
      staffUserId: user.email || user.name,
      staffName: user.name,
      twilioSid: callSid,
      summary: "Browser dialer call",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not log call" },
      { status: 400 }
    );
  }
}
