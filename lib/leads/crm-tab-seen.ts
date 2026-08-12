import type { LeadCrmView } from "./filters";

const STORAGE_KEY = "mds-leads-crm-seen";
const INITIALIZED_KEY = "mds-leads-crm-seen-initialized";

export const LEAD_BADGE_VIEWS = ["scheduled", "complete", "abandoned"] as const;

export type LeadBadgeView = (typeof LEAD_BADGE_VIEWS)[number];

export function isLeadBadgeView(view: string): view is LeadBadgeView {
  return (LEAD_BADGE_VIEWS as readonly string[]).includes(view);
}

export interface LeadBadgeEntry {
  id: string;
  updatedAt: string;
}

type SeenByView = Partial<Record<LeadCrmView, Record<string, string>>>;

function readSeen(): SeenByView {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as SeenByView;
  } catch {
    return {};
  }
}

function writeSeen(seen: SeenByView) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}

export function countUnseenForView(view: LeadCrmView, leads: LeadBadgeEntry[]): number {
  const seenForView = readSeen()[view] ?? {};
  return leads.filter((lead) => {
    const seenAt = seenForView[lead.id];
    return !seenAt || lead.updatedAt > seenAt;
  }).length;
}

export function countUnseenByView(
  views: Partial<Record<LeadCrmView, LeadBadgeEntry[]>>
): Record<LeadBadgeView, number> {
  return {
    scheduled: countUnseenForView("scheduled", views.scheduled ?? []),
    complete: countUnseenForView("complete", views.complete ?? []),
    abandoned: countUnseenForView("abandoned", views.abandoned ?? []),
  };
}

export function markViewSeen(view: LeadCrmView, leads: LeadBadgeEntry[]) {
  const seen = readSeen();
  const seenForView = { ...(seen[view] ?? {}) };
  for (const lead of leads) {
    seenForView[lead.id] = lead.updatedAt;
  }
  seen[view] = seenForView;
  writeSeen(seen);
}

/** First visit: treat current leads as already seen so only new activity badges. */
export function initializeSeenIfNeeded(views: Partial<Record<LeadCrmView, LeadBadgeEntry[]>>) {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(INITIALIZED_KEY)) return;
  for (const view of LEAD_BADGE_VIEWS) {
    markViewSeen(view, views[view] ?? []);
  }
  localStorage.setItem(INITIALIZED_KEY, "1");
}
