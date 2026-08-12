"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import {
  getAbandonedLeadSubtab,
  hasValidLeadPhone,
  isAbandonedLead,
  isAppointmentInProgress,
  isScheduledLead,
  matchesAbandonedSubtab,
  type AbandonedLeadSubtab,
  type LeadCrmView,
} from "@/lib/leads/filters";
import {
  countUnseenByView,
  initializeSeenIfNeeded,
  isLeadBadgeView,
  LEAD_BADGE_VIEWS,
  markViewSeen,
  type LeadBadgeEntry,
} from "@/lib/leads/crm-tab-seen";
import {
  funnelStepOrder,
  LEAD_FUNNEL_STEPS,
  type LeadFollowUpMode,
  type LeadFunnelStep,
  type LeadListStatus,
  type VisitOutcome,
} from "@/lib/leads/types";
import { formatLeadPets } from "@/lib/booking/pets";
import {
  formatDaysSinceLastAppointment,
  formatLeadAppointmentWhen,
} from "@/lib/leads/appointment-fields";
import { getServiceLabel } from "@/lib/pricing";
import JobApplicantsPanel from "@/components/leads/JobApplicantsPanel";
import LeadDetailsEditor, {
  leadToFormValues,
  type LeadDetailsFormValues,
} from "@/components/leads/LeadDetailsEditor";
import SendToGroomerButton from "@/components/staff/SendToGroomerButton";
import type { GroomerId } from "@/lib/scheduling/types";

type LeadsPanelView = LeadCrmView | "job_applicants";

interface LeadNote {
  id: string;
  text: string;
  createdAt: string;
}

interface LeadRow {
  id: string;
  phone: string;
  contactMadeAt: string;
  updatedAt: string;
  funnelStep: LeadFunnelStep;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  petName?: string;
  petSize?: string;
  pets?: { petName: string; petSize: string }[];
  service?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  discountActive?: boolean;
  lastAppointmentAt?: string;
  scheduledAt?: string;
  appointmentStartAt?: string;
  groomerId?: GroomerId;
  groomerName?: string;
  followUpMode: LeadFollowUpMode;
  visitOutcome: VisitOutcome;
  listStatus: LeadListStatus;
  notes: LeadNote[];
  source: "booking" | "booking-hb" | "booking-oc" | "booking-jessica" | "booking-melanie" | "contact" | "franchise" | "heyflow";
  followUpDue?: boolean;
  currentlyActive?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function displayName(lead: LeadRow) {
  if (lead.fullName?.trim()) return lead.fullName;
  if (lead.firstName || lead.lastName) {
    return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  }
  return "—";
}

function isDiamondLead(lead: LeadRow) {
  return lead.groomerId === "diamond" || lead.groomerName === "Diamond";
}

function rowStyle(lead: LeadRow, view: LeadCrmView) {
  if (view === "complete") {
    if (isAppointmentInProgress(lead)) {
      return "border-blue-500 bg-blue-100";
    }
    return lead.visitOutcome === "complete"
      ? "border-green-400 bg-green-50"
      : "border-red-400 bg-red-50";
  }
  if (isScheduledLead(lead)) {
    if (isDiamondLead(lead)) {
      return lead.followUpMode === "chill"
        ? "border-blue-300 bg-blue-50"
        : "border-blue-500 bg-blue-100";
    }
    return lead.followUpMode === "chill"
      ? "border-blue-300 bg-blue-50"
      : "border-purple-400 bg-purple-50";
  }
  if (lead.followUpMode === "chill") {
    return "border-blue-300 bg-blue-50";
  }
  return "border-amber-300 bg-amber-50";
}

function FunnelProgress({ step }: { step: LeadFunnelStep }) {
  const currentOrder = funnelStepOrder(step);

  return (
    <div className="flex flex-wrap gap-1">
      {LEAD_FUNNEL_STEPS.map((s) => {
        const done = s.order <= currentOrder;
        const active = s.id === step;
        return (
          <span
            key={s.id}
            title={s.label}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              active
                ? "bg-brand text-white"
                : done
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-400"
            }`}
          >
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

type LeadSort = "funnel_desc" | "funnel_asc" | "contact_desc" | "contact_asc";

type BadgeViewsState = Record<LeadCrmView, LeadBadgeEntry[]>;

const EMPTY_BADGE_VIEWS: BadgeViewsState = {
  scheduled: [],
  complete: [],
  abandoned: [],
  cold_storage: [],
};

function LeadTabButton({
  label,
  active,
  badgeCount,
  onClick,
}: {
  label: string;
  active: boolean;
  badgeCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
      {badgeCount > 0 && (
        <span
          className={`absolute -top-1.5 -right-1.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
            active ? "bg-white text-brand" : "bg-accent text-white"
          }`}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </button>
  );
}

const ABANDONED_SUBTABS: { id: AbandonedLeadSubtab; label: string }[] = [
  { id: "phone", label: "Phone" },
  { id: "address", label: "Address" },
  { id: "no_info", label: "No Info" },
  { id: "all", label: "All" },
];

const SORT_OPTIONS: { value: LeadSort; label: string }[] = [
  { value: "contact_desc", label: "Contact date: newest" },
  { value: "contact_asc", label: "Contact date: oldest" },
  { value: "funnel_desc", label: "Funnel: furthest along" },
  { value: "funnel_asc", label: "Funnel: earliest step" },
];

function sortLeads(leads: LeadRow[], sort: LeadSort): LeadRow[] {
  const sorted = [...leads];
  sorted.sort((a, b) => {
    if (sort === "funnel_desc" || sort === "funnel_asc") {
      const stepDiff = funnelStepOrder(a.funnelStep) - funnelStepOrder(b.funnelStep);
      if (stepDiff !== 0) return sort === "funnel_desc" ? -stepDiff : stepDiff;
      return new Date(b.contactMadeAt).getTime() - new Date(a.contactMadeAt).getTime();
    }
    const timeDiff =
      new Date(a.contactMadeAt).getTime() - new Date(b.contactMadeAt).getTime();
    return sort === "contact_desc" ? -timeDiff : timeDiff;
  });
  return sorted;
}

function sortAbandonedLeads(leads: LeadRow[], sort: LeadSort): LeadRow[] {
  return sortLeads(leads, sort);
}

function sortScheduledLeads(leads: LeadRow[]): LeadRow[] {
  const sorted = [...leads];
  sorted.sort((a, b) => {
    const aTime = a.appointmentStartAt ? new Date(a.appointmentStartAt).getTime() : Infinity;
    const bTime = b.appointmentStartAt ? new Date(b.appointmentStartAt).getTime() : Infinity;
    return aTime - bTime;
  });
  return sorted;
}

function sortCompletedLeads(leads: LeadRow[]): LeadRow[] {
  const sorted = [...leads];
  sorted.sort((a, b) => {
    const aInProgress = isAppointmentInProgress(a) ? 0 : 1;
    const bInProgress = isAppointmentInProgress(b) ? 0 : 1;
    if (aInProgress !== bInProgress) return aInProgress - bInProgress;

    const aComplete = a.visitOutcome === "complete" ? 0 : 1;
    const bComplete = b.visitOutcome === "complete" ? 0 : 1;
    if (aComplete !== bComplete) return aComplete - bComplete;

    const aTime = a.lastAppointmentAt
      ? new Date(a.lastAppointmentAt).getTime()
      : a.appointmentStartAt
        ? new Date(a.appointmentStartAt).getTime()
        : 0;
    const bTime = b.lastAppointmentAt
      ? new Date(b.lastAppointmentAt).getTime()
      : b.appointmentStartAt
        ? new Date(b.appointmentStartAt).getTime()
        : 0;
    return bTime - aTime;
  });
  return sorted;
}

function FollowUpToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: LeadFollowUpMode;
  disabled?: boolean;
  onChange: (mode: LeadFollowUpMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("fu")}
        className={`px-2.5 py-1 transition-colors ${
          mode === "fu"
            ? "bg-purple-500 text-white"
            : "bg-white text-gray-500 hover:bg-purple-50"
        } disabled:opacity-50`}
      >
        FU
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("chill")}
        className={`px-2.5 py-1 transition-colors ${
          mode === "chill"
            ? "bg-blue-500 text-white"
            : "bg-white text-gray-500 hover:bg-blue-50"
        } disabled:opacity-50`}
      >
        Chill
      </button>
    </div>
  );
}

function VisitOutcomeToggle({
  outcome,
  disabled,
  onChange,
}: {
  outcome: VisitOutcome;
  disabled?: boolean;
  onChange: (outcome: VisitOutcome) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("complete")}
        className={`px-2.5 py-1 transition-colors ${
          outcome === "complete"
            ? "bg-green-500 text-white"
            : "bg-white text-gray-500 hover:bg-green-50"
        } disabled:opacity-50`}
      >
        Complete
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("incomplete")}
        className={`px-2.5 py-1 transition-colors ${
          outcome === "incomplete"
            ? "bg-red-500 text-white"
            : "bg-white text-gray-500 hover:bg-red-50"
        } disabled:opacity-50`}
      >
        Incomplete
      </button>
    </div>
  );
}

export default function LeadsPanel({
  hideJobApplicants = false,
  allowDelete = true,
  apiBase = "/api/admin/leads",
  currentGroomerId,
  contactsLayout = false,
  melanieFollowUpCrm = false,
}: {
  hideJobApplicants?: boolean;
  allowDelete?: boolean;
  apiBase?: string;
  currentGroomerId?: GroomerId;
  /** Admin Contacts tab: Customers and Scheduled only (no leads funnel / applicants). */
  contactsLayout?: boolean;
  /** Melanie: all-team follow-up workspace with notes and FU/chill toggles. */
  melanieFollowUpCrm?: boolean;
}) {
  const [view, setView] = useState<LeadsPanelView>("scheduled");
  const [abandonedSubtab, setAbandonedSubtab] = useState<AbandonedLeadSubtab>("all");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<LeadSort>("contact_desc");
  const [badgeViews, setBadgeViews] = useState<BadgeViewsState>(EMPTY_BADGE_VIEWS);
  const [badgeCounts, setBadgeCounts] = useState({
    scheduled: 0,
    complete: 0,
    abandoned: 0,
  });

  const loadBadges = useCallback(() => {
    return fetch(`${apiBase}?badges=1`)
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((data) => {
        const views: BadgeViewsState = {
          ...EMPTY_BADGE_VIEWS,
          ...(data.views ?? {}),
        };
        initializeSeenIfNeeded(views);
        setBadgeViews(views);
        setBadgeCounts(countUnseenByView(views));
        return views;
      })
      .catch(() => undefined);
  }, [apiBase]);

  const switchToView = useCallback(
    (next: LeadsPanelView) => {
      setView(next);
      setExpandedId(null);
      setEditingId(null);
      if (next === "abandoned") {
        setAbandonedSubtab("all");
      }
      if (isLeadBadgeView(next)) {
        const entries = badgeViews[next] ?? [];
        markViewSeen(next, entries);
        setBadgeCounts((prev) => ({ ...prev, [next]: 0 }));
      }
    },
    [badgeViews]
  );

  useEffect(() => {
    void loadBadges();
    const interval = window.setInterval(() => {
      void loadBadges();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadBadges]);

  useEffect(() => {
    if (!isLeadBadgeView(view)) return;
    const entries = badgeViews[view];
    if (!entries?.length) return;
    markViewSeen(view, entries);
    setBadgeCounts(countUnseenByView(badgeViews));
  }, [view, badgeViews]);

  const sortedLeads = useMemo(() => {
    let list: LeadRow[];
    if (view === "complete") list = sortCompletedLeads(leads);
    else if (view === "scheduled") list = sortScheduledLeads(leads);
    else if (view === "abandoned") list = sortAbandonedLeads(leads, sort);
    else list = sortLeads(leads, sort);

    if (melanieFollowUpCrm && view === "scheduled") {
      list = [...list].sort((a, b) => {
        const aDue = a.followUpDue ? 0 : 1;
        const bDue = b.followUpDue ? 0 : 1;
        if (aDue !== bDue) return aDue - bDue;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    }
    return list;
  }, [leads, sort, view, melanieFollowUpCrm]);

  const abandonedSubtabCounts = useMemo(() => {
    if (view !== "abandoned") return null;
    const counts: Record<AbandonedLeadSubtab, number> = {
      phone: 0,
      address: 0,
      no_info: 0,
      all: sortedLeads.length,
    };
    for (const lead of sortedLeads) {
      counts[getAbandonedLeadSubtab(lead)]++;
    }
    return counts;
  }, [sortedLeads, view]);

  const displayedLeads = useMemo(() => {
    if (view !== "abandoned" || abandonedSubtab === "all") return sortedLeads;
    return sortedLeads.filter((lead) => matchesAbandonedSubtab(lead, abandonedSubtab));
  }, [sortedLeads, view, abandonedSubtab]);

  const loadLeads = useCallback((options?: { silent?: boolean }) => {
    if (view === "job_applicants") {
      setLoading(false);
      return Promise.resolve();
    }
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    return fetch(`${apiBase}?view=${view}`)
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((d) =>
        setLeads(
          (d.leads ?? []).map((lead: LeadRow) => ({
            ...lead,
            notes: lead.notes ?? [],
            followUpMode: lead.followUpMode ?? "fu",
            listStatus: lead.listStatus ?? "active",
          }))
        )
      )
      .catch(() => {
        if (!options?.silent) setError("Could not load leads.");
      })
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  }, [view, apiBase]);

  useEffect(() => {
    if (view === "job_applicants") {
      setLoading(false);
      return;
    }
    loadLeads();
  }, [loadLeads, view]);

  async function patchLead(
    leadId: string,
    body: {
      followUpMode?: LeadFollowUpMode;
      visitOutcome?: VisitOutcome;
      listStatus?: LeadListStatus;
    } & Partial<LeadDetailsFormValues>
  ) {
    const isInlineToggle =
      (body.followUpMode !== undefined || body.visitOutcome !== undefined) &&
      body.listStatus === undefined &&
      !Object.keys(body).some(
        (key) =>
          key !== "followUpMode" &&
          key !== "visitOutcome" &&
          body[key as keyof typeof body] !== undefined
      );

    const previousLeads = leads;
    if (isInlineToggle) {
      setLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? { ...lead, ...body } : lead))
      );
    }

    setSavingId(leadId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed");
      }
      if (
        body.listStatus === "cold_storage" &&
        (view === "abandoned" || view === "scheduled" || view === "complete")
      ) {
        setExpandedId(null);
      }
      if (body.listStatus === "active" && view === "cold_storage") {
        setExpandedId(null);
      }
      if (!isInlineToggle) {
        await loadLeads({ silent: true });
      }
      await loadBadges();
      setEditingId(null);
    } catch (err) {
      if (isInlineToggle) {
        setLeads(previousLeads);
      }
      setError(err instanceof Error ? err.message : "Could not update lead.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveLeadDetails(leadId: string, values: LeadDetailsFormValues) {
    await patchLead(leadId, values);
  }

  async function deleteLead(leadId: string) {
    if (
      !window.confirm(
        "Delete this lead permanently? Their appointment will be cancelled and they will be removed from analytics."
      )
    ) {
      return;
    }

    setSavingId(leadId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${leadId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setExpandedId(null);
      await loadLeads();
      await loadBadges();
    } catch {
      setError("Could not delete lead.");
    } finally {
      setSavingId(null);
    }
  }

  async function addNote(leadId: string) {
    const text = noteDrafts[leadId]?.trim();
    if (!text) return;

    setSavingId(leadId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Failed");
      setNoteDrafts((prev) => ({ ...prev, [leadId]: "" }));
      await loadLeads({ silent: true });
      await loadBadges();
      setExpandedId(leadId);
    } catch {
      setError("Could not save note.");
    } finally {
      setSavingId(null);
    }
  }

  const emptyMessage =
    view === "abandoned"
      ? contactsLayout
        ? "No leads in the funnel yet. Incomplete bookings and partial form fills appear here."
        : "No abandoned leads yet. Incomplete bookings and leads still in the funnel appear here."
      : view === "scheduled"
        ? "No upcoming scheduled appointments."
        : view === "complete"
          ? contactsLayout
            ? "No customers yet. Visits move here one hour after their appointment start time."
            : "No completed visits yet. Appointments move here one hour after their start time."
          : "No leads in cold storage.";

  return (
    <div className="space-y-4">
      {melanieFollowUpCrm ? (
        <div className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-950">
          <p className="font-bold text-brand mb-1">Follow-up CRM</p>
          <p>
            New bookings land in <strong>Scheduled</strong> with FU mode on. Log notes after each
            call, toggle FU / Chill, and use <strong>Abandoned</strong> for partial form fills.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {contactsLayout ? (
          <>
            <LeadTabButton
              label="Scheduled"
              active={view === "scheduled"}
              badgeCount={view === "scheduled" ? 0 : badgeCounts.scheduled}
              onClick={() => switchToView("scheduled")}
            />
            <LeadTabButton
              label="Customers"
              active={view === "complete"}
              badgeCount={view === "complete" ? 0 : badgeCounts.complete}
              onClick={() => switchToView("complete")}
            />
          </>
        ) : (
          <>
            <LeadTabButton
              label="Scheduled"
              active={view === "scheduled"}
              badgeCount={view === "scheduled" ? 0 : badgeCounts.scheduled}
              onClick={() => switchToView("scheduled")}
            />
            <LeadTabButton
              label="Complete"
              active={view === "complete"}
              badgeCount={view === "complete" ? 0 : badgeCounts.complete}
              onClick={() => switchToView("complete")}
            />
            <LeadTabButton
              label="Abandoned"
              active={view === "abandoned"}
              badgeCount={view === "abandoned" ? 0 : badgeCounts.abandoned}
              onClick={() => switchToView("abandoned")}
            />
            {!melanieFollowUpCrm && (
              <button
                type="button"
                onClick={() => switchToView("cold_storage")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  view === "cold_storage"
                    ? "bg-brand text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Cold storage
              </button>
            )}
            {!hideJobApplicants && !melanieFollowUpCrm && (
              <button
                type="button"
                onClick={() => switchToView("job_applicants")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  view === "job_applicants"
                    ? "bg-brand text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Job applicants
              </button>
            )}
          </>
        )}
      </div>

      {view === "abandoned" && (
        <div className="flex flex-wrap gap-2">
          {ABANDONED_SUBTABS.map((subtab) => (
            <button
              key={subtab.id}
              type="button"
              onClick={() => {
                setAbandonedSubtab(subtab.id);
                setExpandedId(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                abandonedSubtab === subtab.id
                  ? "bg-accent text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subtab.label}
              {abandonedSubtabCounts && (
                <span className="ml-1.5 tabular-nums opacity-90">
                  ({abandonedSubtabCounts[subtab.id]})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {view === "job_applicants" ? (
        <JobApplicantsPanel />
      ) : loading ? (
        <p className="text-sm text-gray-500">Loading leads…</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-gray-600 rounded-xl bg-gray-50 border border-gray-200 px-4 py-6">
          {error ?? emptyMessage}
        </p>
      ) : displayedLeads.length === 0 ? (
        <p className="text-sm text-gray-600 rounded-xl bg-gray-50 border border-gray-200 px-4 py-6">
          No abandoned leads in this category.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {displayedLeads.length} lead{displayedLeads.length === 1 ? "" : "s"}
              {view === "abandoned" && abandonedSubtab !== "all" && (
                <span className="text-gray-500"> · {leads.length} total abandoned</span>
              )}
              {view === "complete"
                ? " · Green = complete, red = incomplete · most recent visit first"
                : view === "scheduled"
                  ? " · Purple = FU, blue = Chill · soonest appointment first"
                  : " · Yellow = FU, blue = Chill"}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {view !== "complete" && view !== "scheduled" && (
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="font-medium text-gray-700">Sort</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as LeadSort)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => loadLeads()}
                className="text-sm font-semibold text-brand hover:text-accent"
              >
                Refresh
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-3">
            {displayedLeads.map((lead) => {
              const expanded = expandedId === lead.id;
              const busy = savingId === lead.id;

              return (
                <article
                  key={lead.id}
                  className={`rounded-xl border overflow-hidden ${rowStyle(lead, view as LeadCrmView)}`}
                >
                  <div className="w-full px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : lead.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">
                            {hasValidLeadPhone(lead)
                              ? formatPhoneDisplay(lead.phone)
                              : "No phone on file"}
                          </p>
                          {isScheduledLead(lead) && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-green-800 bg-green-200 px-2 py-0.5 rounded-full">
                              Scheduled
                            </span>
                          )}
                          {isAppointmentInProgress(lead) && view === "complete" && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-blue-900 bg-blue-200 px-2 py-0.5 rounded-full">
                              In progress
                            </span>
                          )}
                          {isAbandonedLead(lead) && view === "abandoned" && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-200 px-2 py-0.5 rounded-full">
                              Picked time
                            </span>
                          )}
                          {lead.followUpDue &&
                            lead.followUpMode === "fu" &&
                            !isScheduledLead(lead) &&
                            view !== "complete" && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-200 px-2 py-0.5 rounded-full">
                              Due
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {displayName(lead)}
                          {lead.currentlyActive && (
                            <span className="text-brand font-semibold"> (currently active)</span>
                          )}
                        </p>
                        {view === "scheduled" && lead.appointmentStartAt && (
                          <p className="text-sm font-medium text-gray-800 mt-0.5">
                            {formatLeadAppointmentWhen(lead.appointmentStartAt, lead.groomerName)}
                          </p>
                        )}
                        {lead.appointmentStartAt && isAbandonedLead(lead) && (
                          <p className="text-sm font-medium text-gray-800 mt-0.5">
                            {formatLeadAppointmentWhen(lead.appointmentStartAt, lead.groomerName)}
                          </p>
                        )}
                        {view === "complete" &&
                          isAppointmentInProgress(lead) &&
                          lead.appointmentStartAt && (
                          <p className="text-sm font-medium text-gray-800 mt-0.5">
                            {formatLeadAppointmentWhen(lead.appointmentStartAt, lead.groomerName)}
                          </p>
                        )}
                        {view === "complete" && lead.lastAppointmentAt && !isAppointmentInProgress(lead) && (
                          <p className="text-sm font-medium text-gray-800 mt-0.5">
                            Last visit: {formatShortDate(lead.lastAppointmentAt)}
                            {lead.visitOutcome === "complete" && (
                              <span className="text-green-800 font-semibold">
                                {" "}
                                · {formatDaysSinceLastAppointment(lead.lastAppointmentAt)}
                              </span>
                            )}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Contact: {formatDate(lead.contactMadeAt)}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">
                      {view === "complete" ? (
                        <VisitOutcomeToggle
                          outcome={lead.visitOutcome}
                          disabled={busy}
                          onChange={(visitOutcome) =>
                            patchLead(lead.id, { visitOutcome })
                          }
                        />
                      ) : (
                        <FollowUpToggle
                          mode={lead.followUpMode}
                          disabled={busy}
                          onChange={(mode) => patchLead(lead.id, { followUpMode: mode })}
                        />
                      )}
                      <FunnelProgress step={lead.funnelStep} />
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-gray-200/80 px-4 py-4 space-y-4 bg-white/60">
                      {editingId === lead.id ? (
                        <LeadDetailsEditor
                          leadId={lead.id}
                          initial={leadToFormValues(lead)}
                          busy={busy}
                          onSave={saveLeadDetails}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <>
                      <div className="grid sm:grid-cols-2 gap-3 text-sm">
                        <p>
                          <span className="text-gray-400">Email:</span> {lead.email || "—"}
                        </p>
                        <p>
                          <span className="text-gray-400">Source:</span>{" "}
                          {lead.source === "heyflow"
                            ? "Heyflow"
                            : lead.source === "contact"
                              ? "Contact form"
                              : "Booking"}
                        </p>
                        <p>
                          <span className="text-gray-400">Pets:</span> {formatLeadPets(lead)}
                        </p>
                        <p>
                          <span className="text-gray-400">Service:</span>{" "}
                          {lead.service ? getServiceLabel(lead.service) : "—"}
                        </p>
                        <p className="sm:col-span-2">
                          <span className="text-gray-400">Address:</span>{" "}
                          {[lead.address, lead.city, lead.zipCode].filter(Boolean).join(", ") ||
                            "—"}
                        </p>
                        {lead.discountActive && (
                          <p>
                            <span className="text-gray-400">Discount:</span> 50% phone offer
                          </p>
                        )}
                        {lead.appointmentStartAt && (
                          <p>
                            <span className="text-gray-400">Appointment:</span>{" "}
                            {formatLeadAppointmentWhen(
                              lead.appointmentStartAt,
                              lead.groomerName
                            )}
                          </p>
                        )}
                        {lead.scheduledAt && (
                          <p>
                            <span className="text-gray-400">Booked:</span>{" "}
                            {formatDate(lead.scheduledAt)}
                          </p>
                        )}
                        {lead.lastAppointmentAt && (
                          <p>
                            <span className="text-gray-400">Last appointment:</span>{" "}
                            {formatShortDate(lead.lastAppointmentAt)}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(lead.id)}
                        className="text-sm font-semibold text-brand hover:text-accent underline disabled:opacity-50"
                      >
                        Edit lead details
                      </button>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                          Notes
                        </p>
                        {lead.notes.length === 0 ? (
                          <p className="text-sm text-gray-500 mb-2">No notes yet.</p>
                        ) : (
                          <ul className="space-y-2 mb-3">
                            {lead.notes.map((note) => (
                              <li
                                key={note.id}
                                className="text-sm bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                              >
                                <p>{note.text}</p>
                                <p className="text-[11px] text-gray-400 mt-1">
                                  {formatDate(note.createdAt)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={noteDrafts[lead.id] ?? ""}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({
                                ...prev,
                                [lead.id]: e.target.value,
                              }))
                            }
                            placeholder="e.g. Left VM, sent text follow up"
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => addNote(lead.id)}
                            className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      <div
                        className="flex flex-wrap gap-2 pt-2 border-t border-gray-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {view === "abandoned" ||
                        view === "scheduled" ||
                        view === "complete" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patchLead(lead.id, { listStatus: "cold_storage" })}
                            className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Move to cold storage
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patchLead(lead.id, { listStatus: "active" })}
                            className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-brand bg-white text-brand hover:bg-brand/5 disabled:opacity-50"
                          >
                            Restore to active
                          </button>
                        )}
                        <SendToGroomerButton
                          type="lead"
                          leadId={lead.id}
                          currentGroomerId={currentGroomerId}
                          disabled={busy}
                          onSent={() => loadLeads()}
                        />
                        {allowDelete && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => deleteLead(lead.id)}
                            className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete permanently
                          </button>
                        )}
                      </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
