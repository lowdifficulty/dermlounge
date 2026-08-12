import type { GroomerId } from "./types";
import { BOOKING_DURATION_MINUTES, GROOMER_AVAILABILITY_BLOCK_MINUTES } from "./services";

export const GROOMERS: Record<
  GroomerId,
  {
    id: GroomerId;
    name: string;
    /** Shown on the public booking calendar only; staff CRM keeps `name`. */
    clientName?: string;
    email: string;
    calendarEmail: string;
    /** When false, excluded from public booking and team availability calendars. */
    acceptsBookings?: boolean;
  }
> = {
  melanie: {
    id: "melanie",
    name: "Melanie",
    email: "melanie@mobiledog-salon.com",
    calendarEmail: "melanie@mobiledog-salon.com",
  },
  diamond: {
    id: "diamond",
    name: "Diamond",
    email: "diamond@mobiledog-salon.com",
    calendarEmail: "diamond@mobiledog-salon.com",
    /** On leave — hide from booking calendars and "Send to Diamond" transfer buttons. */
    acceptsBookings: false,
  },
  jessica: {
    id: "jessica",
    name: "Jessica",
    email: "jessica@mobiledog-salon.com",
    calendarEmail: "jessica@mobiledog-salon.com",
  },
};

export const MELANIE_BOOKING_NOTIFY_EMAILS = [
  "mellyx9@yahoo.com",
  "melanieandlicky@gmail.com",
  "melanie@mobiledog-salon.com",
];

export const CALENDAR_NOTIFY_EMAILS = [
  ...MELANIE_BOOKING_NOTIFY_EMAILS,
  "team@mobiledog-salon.com",
];

export const ADMIN_USERNAME = "1";

/** Legacy session / audit label; login uses {@link ADMIN_USERNAME}. */
export const ADMIN_EMAIL = "info@mydermlounge.com";

export const WORK_START_HOUR = 8;
/** Last 3-hour shift starts at 5 PM and ends at 8 PM. */
export const WORK_END_HOUR = 20;

/** How far ahead staff can select shifts (calendar months from today). */
export const SHIFT_HORIZON_MONTHS = 3;

export const TIME_SLOT_OPTIONS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
] as const;

/** 3-hour shifts groomers can work (every day, up to SHIFT_HORIZON_MONTHS ahead). */
export const BOOKING_BLOCK_STARTS = [
  "08:00",
  "11:00",
  "14:00",
  "17:00",
] as const;

/** 2-hour shifts for Jessica. */
export const JESSICA_BOOKING_BLOCK_STARTS = [
  "08:00",
  "10:00",
  "12:00",
  "14:00",
  "16:00",
  "18:00",
] as const;

export function bookingDurationMinutesForGroomer(groomerId: GroomerId): number {
  return groomerId === "jessica" ? 120 : BOOKING_DURATION_MINUTES;
}

export function availabilityBlockMinutesForGroomer(groomerId: GroomerId): number {
  return groomerId === "jessica" ? 120 : GROOMER_AVAILABILITY_BLOCK_MINUTES;
}

export function bookingBlockStartsForGroomer(groomerId: GroomerId): readonly string[] {
  return groomerId === "jessica" ? JESSICA_BOOKING_BLOCK_STARTS : BOOKING_BLOCK_STARTS;
}

export function isAllowedBookingBlockStart(time: string, groomerId?: GroomerId): boolean {
  if (groomerId) {
    return (bookingBlockStartsForGroomer(groomerId) as readonly string[]).includes(time);
  }
  return (BOOKING_BLOCK_STARTS as readonly string[]).includes(time);
}

/** Jessica trial: customers can only book within N days ahead (lift via env). */
export function isJessicaTrialBookingRestricted(): boolean {
  const flag = process.env.JESSICA_TRIAL_BOOKING_RESTRICTED;
  if (flag === "1" || flag === "true") return true;
  return false;
}

export function customerBookingHorizonDaysForGroomer(groomerId: GroomerId): number | null {
  if (groomerId !== "jessica") return null;
  if (!isJessicaTrialBookingRestricted()) return null;
  const raw = process.env.JESSICA_BOOKING_HORIZON_DAYS ?? "7";
  const days = parseInt(raw, 10);
  return Number.isFinite(days) && days > 0 ? days : 7;
}

function formatTimeRangeDisplay(startTime24: string, durationMinutes: number): string {
  const [h, m] = startTime24.split(":").map(Number);
  const endMinutes = h * 60 + (m ?? 0) + durationMinutes;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const endTime24 = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  return `${formatDisplayTime(startTime24)} – ${formatDisplayTime(endTime24)}`;
}

/** Staff / groomer views — full appointment length. */
export function formatBookingBlockDisplay(
  startTime24: string,
  groomerId?: GroomerId
): string {
  const duration = groomerId
    ? bookingDurationMinutesForGroomer(groomerId)
    : BOOKING_DURATION_MINUTES;
  return formatTimeRangeDisplay(startTime24, duration);
}

/** Customer self-booking calendar slots. */
export function formatSelfBookingSlotDisplay(
  startTime24: string,
  groomerId?: GroomerId
): string {
  const duration = groomerId
    ? bookingDurationMinutesForGroomer(groomerId)
    : BOOKING_DURATION_MINUTES;
  return formatTimeRangeDisplay(startTime24, duration);
}

export function formatDisplayTime(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function groomerName(id: GroomerId): string {
  return GROOMERS[id].name;
}

export function groomerAcceptsBookings(id: GroomerId): boolean {
  return GROOMERS[id].acceptsBookings !== false;
}

export const BOOKABLE_GROOMER_IDS = (Object.keys(GROOMERS) as GroomerId[]).filter(
  groomerAcceptsBookings
);

export function defaultBookableGroomerId(): GroomerId {
  return BOOKABLE_GROOMER_IDS[0] ?? "melanie";
}

/** Client-facing booking calendar and confirmation copy. */
export function groomerClientDisplayName(id: GroomerId): string {
  const groomer = GROOMERS[id];
  return groomer.clientName ?? groomer.name;
}

/** Page-specific calendar label; falls back to {@link groomerClientDisplayName}. */
export function resolveGroomerClientDisplayName(
  id: GroomerId,
  overrides?: Partial<Record<GroomerId, string>>
): string {
  return overrides?.[id] ?? groomerClientDisplayName(id);
}

export function groomerIdFromEmail(email: string): GroomerId | null {
  const normalized = email.trim().toLowerCase();
  for (const groomer of Object.values(GROOMERS)) {
    if (groomer.email.toLowerCase() === normalized) {
      return groomer.id;
    }
  }
  return null;
}

/** Melanie and Diamond see the full team schedule; territory groomers see only their own. */
export function groomerSeesTeamAppointments(groomerId: GroomerId): boolean {
  return groomerId === "melanie" || groomerId === "diamond";
}
