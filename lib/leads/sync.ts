import "server-only";
import { readSchedulingData } from "@/lib/scheduling/store";
import { readLeadsData, writeLeadsData } from "./store";
import { normalizePhone } from "./normalize";
import { leadFieldsFromAppointment } from "./appointment-fields";
import { funnelStepOrder, type Lead } from "./types";

const FOLLOW_UP_DAYS = 14;

export function isFollowUpDue(lead: Lead): boolean {
  if (lead.funnelStep !== "appointment_completed" || !lead.lastAppointmentAt) {
    return false;
  }
  const completed = new Date(lead.lastAppointmentAt);
  const due = new Date(completed);
  due.setDate(due.getDate() + FOLLOW_UP_DAYS);
  return new Date() >= due;
}

export async function syncLeadsWithAppointments(): Promise<Lead[]> {
  const [leadsData, scheduling] = await Promise.all([
    readLeadsData(),
    readSchedulingData(),
  ]);

  const now = Date.now();
  let changed = false;

  const leads = leadsData.leads.map((lead) => {
    let next = { ...lead };

    const appointment = lead.appointmentId
      ? scheduling.appointments.find((a) => a.id === lead.appointmentId)
      : scheduling.appointments.find(
          (a) =>
            a.status === "confirmed" &&
            normalizePhone(a.phone) === normalizePhone(lead.phone) &&
            lead.phone.length >= 10
        );

    if (appointment && appointment.status === "confirmed") {
      const bookingFields = leadFieldsFromAppointment(appointment);
      const needsBookingFields =
        next.appointmentStartAt !== bookingFields.appointmentStartAt ||
        next.groomerName !== bookingFields.groomerName;

      const endMs =
        new Date(appointment.startAt).getTime() +
        appointment.durationMinutes * 60 * 1000;

      if (endMs <= now) {
        const autoComplete = !next.visitOutcomeManual;
        if (next.funnelStep !== "appointment_completed") {
          next = {
            ...next,
            funnelStep: "appointment_completed",
            appointmentId: appointment.id,
            lastAppointmentAt: appointment.startAt,
            visitOutcome: autoComplete ? "complete" : (next.visitOutcome ?? "complete"),
            ...bookingFields,
          };
          changed = true;
        } else if (next.lastAppointmentAt !== appointment.startAt) {
          next = {
            ...next,
            lastAppointmentAt: appointment.startAt,
            visitOutcome: autoComplete ? "complete" : next.visitOutcome,
            ...bookingFields,
          };
          changed = true;
        } else if (autoComplete && next.visitOutcome === "incomplete") {
          next = { ...next, visitOutcome: "complete" };
          changed = true;
        } else if (needsBookingFields) {
          next = { ...next, ...bookingFields };
          changed = true;
        }
      } else if (funnelIsBeforeScheduled(next.funnelStep)) {
        next = {
          ...next,
          funnelStep: "scheduled",
          followUpMode: "fu",
          appointmentId: appointment.id,
          scheduledAt: next.scheduledAt ?? appointment.createdAt,
          ...bookingFields,
        };
        changed = true;
      } else if (needsBookingFields) {
        next = { ...next, ...bookingFields };
        changed = true;
      }
    }

    return next;
  });

  if (changed) {
    await writeLeadsData({ leads });
  }

  return leads.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function funnelIsBeforeScheduled(step: Lead["funnelStep"]): boolean {
  return funnelStepOrder(step) < funnelStepOrder("scheduled");
}
