import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { patchLeadForAppointment } from "@/lib/leads/appointment-lead";
import type { LeadDetailsPatch } from "@/lib/leads/patch-lead";

type RouteContext = { params: Promise<{ appointmentId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireStaff();
    const { appointmentId } = await context.params;
    const body = (await request.json()) as LeadDetailsPatch;

    const result = await patchLeadForAppointment(appointmentId, body, user.email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ lead: result.lead });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
