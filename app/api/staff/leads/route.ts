import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/scheduling/auth";
import { isLeadCurrentlyActive } from "@/lib/leads/activity";
import {
  isAppointmentInProgress,
  leadMatchesCrmView,
  withLeadDefaults,
  type LeadCrmView,
} from "@/lib/leads/filters";
import { isFollowUpDue, syncLeadsWithAppointments } from "@/lib/leads/sync";

const VALID_VIEWS: LeadCrmView[] = ["scheduled", "complete", "abandoned", "cold_storage"];
const BADGE_VIEWS: LeadCrmView[] = ["scheduled", "complete", "abandoned"];

export async function GET(request: Request) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);

    if (searchParams.get("badges") === "1") {
      const leads = await syncLeadsWithAppointments();
      const normalized = leads.map(withLeadDefaults);
      const views = Object.fromEntries(
        BADGE_VIEWS.map((view) => [
          view,
          normalized
            .filter((lead) => leadMatchesCrmView(lead, view))
            .map((lead) => ({ id: lead.id, updatedAt: lead.updatedAt })),
        ])
      );
      return NextResponse.json({ views });
    }

    const viewParam = searchParams.get("view") ?? "scheduled";
    const view = VALID_VIEWS.includes(viewParam as LeadCrmView)
      ? (viewParam as LeadCrmView)
      : "scheduled";

    const leads = await syncLeadsWithAppointments();
    const filtered = leads
      .map(withLeadDefaults)
      .filter((lead) => leadMatchesCrmView(lead, view))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return NextResponse.json({
      leads: filtered.map((lead) => ({
        ...lead,
        followUpDue: isFollowUpDue(lead),
        currentlyActive:
          isAppointmentInProgress(lead) || isLeadCurrentlyActive(lead),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
