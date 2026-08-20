import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { readWoundCareConsultations } from "@/lib/wound-care/store";
import { findContactByPhone } from "@/lib/crm/store";
import {
  woundDurationLabel,
  woundInsuranceLabel,
  woundSizeLabel,
} from "@/lib/wound-care/labels";

export async function GET() {
  try {
    await requireStaff();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const consultations = await readWoundCareConsultations();
  const now = Date.now();

  const enriched = await Promise.all(
    consultations
      .filter((c) => c.status === "confirmed")
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map(async (c) => {
        const contact = await findContactByPhone(c.phone);
        return {
          ...c,
          woundSizeLabel: woundSizeLabel(c.woundSize),
          woundDurationLabel: woundDurationLabel(c.woundDuration),
          insuranceLabel: woundInsuranceLabel(c.insurance),
          contactId: contact?.id ?? null,
          isPast: new Date(c.startAt).getTime() < now,
        };
      })
  );

  return NextResponse.json({ consultations: enriched });
}
