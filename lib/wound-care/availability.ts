import "server-only";
import type { WoundCareConsultation, WoundCareSlot } from "./types";
import { readWoundCareConsultations } from "./store";

const TZ = "America/Los_Angeles";

/** Three consultation times per day — rotates slightly by weekday for variety. */
const SLOT_SETS: string[][] = [
  ["09:00", "12:00", "15:00"],
  ["10:00", "13:00", "16:00"],
];

function formatDisplayDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(dt);
}

function formatDisplayTime(time: string): string {
  const [h, min] = time.split(":").map(Number);
  const dt = new Date(Date.UTC(2020, 0, 1, h, min, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
}

function pacificParts(now = new Date()): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    h: get("hour"),
    min: get("minute"),
  };
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(y: number, m: number, d: number, days: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Approximate Pacific ISO for a local date + HH:mm (good enough for display + booking). */
export function slotStartAtIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, h + 8, min, 0));
  return utcGuess.toISOString();
}

export function buildSlotKey(date: string, time: string): string {
  return `wc:${date}:${time}`;
}

function isSunday(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay() === 0;
}

function bookedKeys(consultations: WoundCareConsultation[]): Set<string> {
  return new Set(
    consultations
      .filter((c) => c.status === "confirmed")
      .map((c) => c.slotKey)
  );
}

export async function listAvailableWoundCareSlots(options?: {
  days?: number;
  now?: Date;
}): Promise<WoundCareSlot[]> {
  const daysWanted = options?.days ?? 5;
  const consultations = await readWoundCareConsultations();
  const taken = bookedKeys(consultations);
  const { y, m, d } = pacificParts(options?.now ?? new Date());
  const todayKey = dateKey(y, m, d);

  const result: WoundCareSlot[] = [];
  let dayOffset = 1;
  let daysCollected = 0;

  while (daysCollected < daysWanted && dayOffset < 60) {
    const date = addDays(y, m, d, dayOffset);
    dayOffset += 1;
    if (isSunday(date)) continue;
    if (date === todayKey) continue;

    const times = SLOT_SETS[daysCollected % SLOT_SETS.length];
    const daySlots: WoundCareSlot[] = [];

    for (const time of times) {
      const slotKey = buildSlotKey(date, time);
      if (taken.has(slotKey)) continue;

      daySlots.push({
        slotKey,
        date,
        time,
        displayDate: formatDisplayDate(date),
        displayTime: formatDisplayTime(time),
        startAt: slotStartAtIso(date, time),
      });
    }

    if (daySlots.length === 0) continue;

    result.push(...daySlots.slice(0, 3));
    daysCollected += 1;
  }

  return result;
}

export function isSameDayWoundCareBooking(date: string, now = new Date()): boolean {
  const { y, m, d } = pacificParts(now);
  return date === dateKey(y, m, d);
}

export async function findWoundCareSlot(
  slotKey: string
): Promise<WoundCareSlot | null> {
  const slots = await listAvailableWoundCareSlots({ days: 14 });
  return slots.find((s) => s.slotKey === slotKey) ?? null;
}
