import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { getLeadFormForAppointment } from "@/lib/leads/appointment-lead";

export async function GET(request: Request) {
  try {
    await requireStaff();
    const appointmentId = new URL(request.url).searchParams.get("appointmentId");
    if (!appointmentId) {
      return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
    }

    const result = await getLeadFormForAppointment(appointmentId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.form);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
