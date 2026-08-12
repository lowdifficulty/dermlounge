import { normalizePhone } from "./normalize";
import { isStaffUpcomingAppointment } from "@/lib/scheduling/appointment-filters";
import { BOOKING_DURATION_MINUTES } from "@/lib/scheduling/services";
import { funnelStepOrder, type Lead, type LeadFunnelStep } from "./types";

const PACIFIC_TZ = "America/Los_Angeles";

export type LeadCrmView = "abandoned" | "scheduled" | "complete" | "cold_storage";

export type AbandonedLeadSubtab = "phone" | "address" | "no_info" | "all";

export function hasValidLeadPhone(lead: Pick<Lead, "phone">): boolean {
  return normalizePhone(lead.phone ?? "").length >= 10;
}

export function hasValidLeadAddress(
  lead: Pick<Lead, "address" | "city" | "zipCode">
): boolean {
  const address = (lead.address ?? "").trim();
  const city = (lead.city ?? "").trim();
  const zip = (lead.zipCode ?? "").trim();
  return address.length >= 3 && city.length >= 2 && /^\d{5}(-\d{4})?$/.test(zip);
}

export function getAbandonedLeadSubtab(
  lead: Pick<Lead, "phone" | "address" | "city" | "zipCode">
): Exclude<AbandonedLeadSubtab, "all"> {
  if (hasValidLeadPhone(lead)) return "phone";
  if (hasValidLeadAddress(lead)) return "address";
  return "no_info";
}

export function matchesAbandonedSubtab(
  lead: Pick<Lead, "phone" | "address" | "city" | "zipCode">,
  subtab: AbandonedLeadSubtab
): boolean {
  if (subtab === "all") return true;
  return getAbandonedLeadSubtab(lead) === subtab;
}

export function appointmentEndMs(
  appointmentStartAt: string,
  durationMinutes = BOOKING_DURATION_MINUTES
): number {
  return new Date(appointmentStartAt).getTime() + durationMinutes * 60 * 1000;
}

/** Appointment start time has passed but the visit window has not ended yet. */
export function isAppointmentInProgress(
  lead: {
    funnelStep: LeadFunnelStep;
    appointmentStartAt?: string;
  },
  now = Date.now(),
  durationMinutes = BOOKING_DURATION_MINUTES
): boolean {
  if (!lead.appointmentStartAt) return false;
  if (funnelStepOrder(lead.funnelStep) < funnelStepOrder("scheduled")) return false;
  const startMs = new Date(lead.appointmentStartAt).getTime();
  if (Number.isNaN(startMs)) return false;
  const endMs = appointmentEndMs(lead.appointmentStartAt, durationMinutes);
  return now >= startMs && now < endMs;
}

export function hasSelectedAppointmentTime(lead: {
  funnelStep: LeadFunnelStep;
  appointmentStartAt?: string;
}): boolean {
  if (lead.appointmentStartAt) return true;
  return funnelStepOrder(lead.funnelStep) >= funnelStepOrder("schedule_appointment");
}

export function appointmentPacificDate(appointmentStartAt: string): string {
  return new Date(appointmentStartAt).toLocaleDateString("en-CA", { timeZone: PACIFIC_TZ });
}

export function isBookedVisitLead(lead: {
  funnelStep: LeadFunnelStep;
  appointmentStartAt?: string;
}): boolean {
  if (!lead.appointmentStartAt) return false;
  if (funnelStepOrder(lead.funnelStep) < funnelStepOrder("scheduled")) return false;
  return true;
}

/** Customers tab: visits at least 1 hour after appointment start (see STAFF_UPCOMING_GRACE_MS). */
export function isCustomerVisitLead(lead: Lead, now: Date = new Date()): boolean {
  const normalized = withLeadDefaults(lead);
  if (!hasValidLeadPhone(normalized)) return false;
  if (isBookedVisitLead(normalized)) {
    if (!normalized.appointmentStartAt) return false;
    return !isStaffUpcomingAppointment(
      { startAt: normalized.appointmentStartAt, status: "confirmed" },
      now
    );
  }
  return isCompletedVisitLead(normalized);
}

export function isScheduledLead(
  lead: {
    funnelStep: LeadFunnelStep;
    appointmentStartAt?: string;
  },
  now: Date = new Date()
): boolean {
  if (!isBookedVisitLead(lead) || !lead.appointmentStartAt) return false;
  return isStaffUpcomingAppointment(
    { startAt: lead.appointmentStartAt, status: "confirmed" },
    now
  );
}

/** Picked a slot but did not complete booking — may still have address without phone. */
export function isAbandonedLead(lead: {
  funnelStep: LeadFunnelStep;
  appointmentStartAt?: string;
  lastAppointmentAt?: string;
  phone?: string;
}): boolean {
  if (isScheduledLead(lead)) return false;
  if (isBookedVisitLead(lead) && normalizePhone(lead.phone ?? "").length >= 10) {
    return false;
  }
  if (isCompletedVisitLead(lead)) return false;
  return hasSelectedAppointmentTime(lead);
}

export function isCompletedVisitLead(lead: {
  funnelStep: LeadFunnelStep;
  lastAppointmentAt?: string;
}): boolean {
  return lead.funnelStep === "appointment_completed" && Boolean(lead.lastAppointmentAt);
}

/** Past the scheduled grace window — appears on the Complete / Customers tab. */
export function isPastVisitLead(
  lead: {
    funnelStep: LeadFunnelStep;
    appointmentStartAt?: string;
    lastAppointmentAt?: string;
  },
  now: Date = new Date()
): boolean {
  if (lead.funnelStep === "appointment_completed" && lead.lastAppointmentAt) {
    return true;
  }
  if (!lead.appointmentStartAt) return false;
  if (funnelStepOrder(lead.funnelStep) < funnelStepOrder("scheduled")) return false;
  return !isStaffUpcomingAppointment(
    { startAt: lead.appointmentStartAt, status: "confirmed" },
    now
  );
}

export function defaultVisitOutcome(
  lead: Pick<Lead, "funnelStep" | "appointmentStartAt" | "lastAppointmentAt">,
  now: Date = new Date()
): Lead["visitOutcome"] {
  if (isAppointmentInProgress(lead, now.getTime())) return "incomplete";
  return isPastVisitLead(lead, now) ? "complete" : "incomplete";
}

export function withLeadDefaults(lead: Lead): Lead {
  return {
    ...lead,
    notes: lead.notes ?? [],
    photos: lead.photos ?? [],
    followUpMode: lead.followUpMode ?? "fu",
    visitOutcome: lead.visitOutcome ?? defaultVisitOutcome(lead),
    listStatus: lead.listStatus ?? "active",
  };
}

/** Non-scheduled, non-completed leads — former Active + Abandoned lists combined. */
export function isInAbandonedCrmView(lead: Lead): boolean {
  const normalized = withLeadDefaults(lead);
  if (normalized.listStatus !== "active") return false;
  if (isScheduledLead(normalized)) return false;
  if (isCustomerVisitLead(normalized)) return false;
  if (hasValidLeadPhone(normalized)) return true;
  return hasSelectedAppointmentTime(normalized);
}

export function leadMatchesCrmView(lead: Lead, view: LeadCrmView): boolean {
  const normalized = withLeadDefaults(lead);

  if (view === "cold_storage") {
    return normalized.listStatus === "cold_storage";
  }

  if (normalized.listStatus !== "active") return false;

  if (view === "scheduled") {
    return isScheduledLead(normalized) && hasValidLeadPhone(normalized);
  }
  if (view === "complete") {
    return isCustomerVisitLead(normalized);
  }
  if (view === "abandoned") {
    return isInAbandonedCrmView(normalized);
  }
  return false;
}

export function leadsForAnalytics(leads: Lead[]): Lead[] {
  return leads.map(withLeadDefaults);
}
