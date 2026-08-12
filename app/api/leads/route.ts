import { NextResponse } from "next/server";
import { upsertLead } from "@/lib/leads/store";
import type { LeadFunnelStep, LeadUpsertInput } from "@/lib/leads/types";

const VALID_STEPS: LeadFunnelStep[] = [
  "phone_entered",
  "view_form",
  "pet_info",
  "package_selected",
  "schedule_appointment",
  "address",
  "contact_details",
  "contact_info",
  "scheduled",
  "appointment_completed",
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeadUpsertInput;

    if (!body.funnelStep || !VALID_STEPS.includes(body.funnelStep)) {
      return NextResponse.json({ error: "Invalid funnel step" }, { status: 400 });
    }

    const hasIdentity =
      (body.phone && body.phone.replace(/\D/g, "").length >= 10) ||
      body.email?.trim() ||
      body.leadSessionId;

    if (!hasIdentity) {
      return NextResponse.json({ error: "Phone, email, or session required" }, { status: 400 });
    }

    const lead = await upsertLead({
      ...body,
      source: body.source ?? "booking",
    });

    return NextResponse.json({ success: true, leadId: lead.id });
  } catch (err) {
    console.error("Lead upsert failed:", err);
    return NextResponse.json({ error: "Could not save lead" }, { status: 500 });
  }
}
