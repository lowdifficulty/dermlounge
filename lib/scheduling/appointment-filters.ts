const STAFF_UPCOMING_GRACE_MS = 60 * 60 * 1000;

export function isStaffUpcomingAppointment(
  appointment: { startAt: string; status: string },
  now: Date = new Date()
): boolean {
  if (appointment.status !== "confirmed") return false;
  const startMs = new Date(appointment.startAt).getTime();
  if (Number.isNaN(startMs)) return false;
  return startMs + STAFF_UPCOMING_GRACE_MS > now.getTime();
}
