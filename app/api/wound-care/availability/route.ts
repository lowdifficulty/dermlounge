import { NextResponse } from "next/server";
import { listAvailableWoundCareSlots } from "@/lib/wound-care/availability";

export async function GET() {
  const slots = await listAvailableWoundCareSlots({ days: 5 });
  const byDate = new Map<string, typeof slots>();
  for (const slot of slots) {
    const list = byDate.get(slot.date) ?? [];
    list.push(slot);
    byDate.set(slot.date, list);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => ({
      date,
      displayDate: daySlots[0]?.displayDate ?? date,
      slots: daySlots.map((s) => ({
        slotKey: s.slotKey,
        displayTime: s.displayTime,
        startAt: s.startAt,
      })),
    }));

  return NextResponse.json({ days });
}
