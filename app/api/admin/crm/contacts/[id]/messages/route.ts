import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { findContactById } from "@/lib/crm/store";
import { sendStaffSms } from "@/lib/crm/messaging";
import {
  buildAppointmentFollowUpSms,
  buildLeadFollowUpSms,
} from "@/lib/crm/sms-bot";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const contact = await findContactById(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      body?: string;
      template?: "lead_follow_up" | "appointment_follow_up";
    };

    let text = body.body?.trim() || "";
    if (!text && body.template === "lead_follow_up") {
      text = buildLeadFollowUpSms(contact);
    } else if (!text && body.template === "appointment_follow_up") {
      text = buildAppointmentFollowUpSms(contact);
    }

    if (!text) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    const result = await sendStaffSms({
      phone: contact.phoneE164 || contact.phone,
      body: text,
      contactId: contact.id,
      staffUserId: user.email || user.name,
      staffName: user.name,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to send SMS", interaction: result.interaction },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, interaction: result.interaction });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
