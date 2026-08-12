/** Lead was active on site within this window (ms). */
export const LEAD_ACTIVE_WINDOW_MS = 3 * 60 * 1000;

export function isLeadCurrentlyActive(lead: {
  lastActiveAt?: string;
}): boolean {
  if (!lead.lastActiveAt) return false;
  const activeMs = new Date(lead.lastActiveAt).getTime();
  if (Number.isNaN(activeMs)) return false;
  return Date.now() - activeMs < LEAD_ACTIVE_WINDOW_MS;
}
