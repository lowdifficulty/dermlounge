import { GROOMERS } from "@/lib/scheduling/groomers";
import type { GroomerId } from "@/lib/scheduling/types";

export interface LeadAppointmentFields {
  appointmentStartAt: string;
  groomerId: GroomerId;
  groomerName: string;
}

export function leadFieldsFromAppointment(appointment: {
  startAt: string;
  groomerId: GroomerId;
}): LeadAppointmentFields {
  return {
    appointmentStartAt: appointment.startAt,
    groomerId: appointment.groomerId,
    groomerName: GROOMERS[appointment.groomerId].name,
  };
}

export function formatLeadAppointmentWhen(
  appointmentStartAt: string,
  groomerName?: string
): string {
  const when = new Date(appointmentStartAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  return groomerName ? `${when} with ${groomerName}` : when;
}

/** Whole days since a past appointment (Pacific calendar days). */
export function daysSinceLastAppointment(lastAppointmentAt: string): number {
  const apptDay = new Date(lastAppointmentAt).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const apptMs = new Date(`${apptDay}T12:00:00`).getTime();
  const todayMs = new Date(`${today}T12:00:00`).getTime();
  return Math.max(0, Math.round((todayMs - apptMs) / (24 * 60 * 60 * 1000)));
}

export function formatDaysSinceLastAppointment(lastAppointmentAt: string): string {
  const days = daysSinceLastAppointment(lastAppointmentAt);
  if (days === 0) return "Today";
  if (days === 1) return "1 day since last visit";
  return `${days} days since last visit`;
}
