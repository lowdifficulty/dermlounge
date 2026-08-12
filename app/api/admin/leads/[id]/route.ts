import { NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/scheduling/auth";
import { deleteLeadById } from "@/lib/leads/store";
import { patchLeadDetails, type LeadDetailsPatch } from "@/lib/leads/patch-lead";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireStaff();
    const { id } = await context.params;
    const body = (await request.json()) as LeadDetailsPatch;

    if (
      body.followUpMode !== undefined &&
      body.followUpMode !== "fu" &&
      body.followUpMode !== "chill"
    ) {
      return NextResponse.json({ error: "Invalid followUpMode" }, { status: 400 });
    }

    if (
      body.visitOutcome !== undefined &&
      body.visitOutcome !== "complete" &&
      body.visitOutcome !== "incomplete"
    ) {
      return NextResponse.json({ error: "Invalid visitOutcome" }, { status: 400 });
    }

    if (
      body.listStatus !== undefined &&
      body.listStatus !== "active" &&
      body.listStatus !== "cold_storage"
    ) {
      return NextResponse.json({ error: "Invalid listStatus" }, { status: 400 });
    }

    const result = await patchLeadDetails(id, body, user.email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ lead: result.lead });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const removed = await deleteLeadById(id);

    if (!removed) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
