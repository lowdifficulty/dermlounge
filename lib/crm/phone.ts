import { normalizePhoneE164 } from "@/lib/notifications/twilio";
import { normalizePhone } from "@/lib/leads/normalize";

export function crmPhoneDigits(phone: string): string {
  return normalizePhone(phone);
}

export function crmPhoneE164(phone: string): string | null {
  return normalizePhoneE164(phone);
}

export function displayNameFromContact(parts: {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
}): string {
  const full = parts.fullName?.trim();
  if (full) return full;
  const joined = [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  return parts.phone?.trim() || "Unknown contact";
}
