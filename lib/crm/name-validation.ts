import { formatPhoneDisplay, normalizePhone } from "@/lib/leads/normalize";
import type { Lead } from "@/lib/leads/types";
import { normalizeContactName } from "./contact-match";
import { isMetaOnlyPhone } from "./meta-contact";
import type { CrmContact } from "./types";

/** True when a text value is a phone number masquerading as a person's name. */
export function isPhoneNumberName(value?: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return false;

  const nonPhoneChars = trimmed.replace(/[\d\s().+\-]/g, "");
  if (nonPhoneChars.length === 0 && digits.length >= 7) return true;

  if (/^\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}$/.test(trimmed)) return true;
  if (/^\d{10,11}$/.test(trimmed.replace(/\s/g, ""))) return true;

  return false;
}

/** Strip phone-number "names"; returns undefined when the value is not a real name. */
export function sanitizePersonName(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || isPhoneNumberName(trimmed)) return undefined;
  return trimmed;
}

export function contactHasPhoneNumberName(
  contact: Pick<CrmContact, "fullName" | "firstName" | "lastName" | "phone">
): boolean {
  if (isPhoneNumberName(contact.fullName)) return true;
  if (isPhoneNumberName(contact.firstName)) return true;
  if (isPhoneNumberName(contact.lastName)) return true;

  const joined = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  if (isPhoneNumberName(joined)) return true;

  if (isMetaOnlyPhone(contact.phone) && !hasRealPersonName(contact)) return true;

  const name = normalizeContactName(contact.fullName) || normalizeContactName(joined);
  if (!name) return isMetaOnlyPhone(contact.phone);

  const digits = contact.phone.replace(/\D/g, "");
  if (digits.length >= 10 && name.replace(/\D/g, "") === digits) return true;
  return name === normalizeContactName(formatPhoneDisplay(contact.phone));
}

export function leadHasPhoneNumberName(
  lead: Pick<Lead, "fullName" | "firstName" | "lastName"> & { phone?: string }
): boolean {
  if (isPhoneNumberName(lead.fullName)) return true;
  if (isPhoneNumberName(lead.firstName)) return true;
  if (isPhoneNumberName(lead.lastName)) return true;

  const joined = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  if (isPhoneNumberName(joined)) return true;

  const phone = lead.phone ? normalizePhone(lead.phone) : "";
  if (phone.length >= 10) {
    const name = normalizeContactName(lead.fullName) || normalizeContactName(joined);
    if (name && name.replace(/\D/g, "") === phone) return true;
    if (name === normalizeContactName(formatPhoneDisplay(phone))) return true;
  }

  return false;
}

export function hasRealPersonName(parts: {
  fullName?: string;
  firstName?: string;
  lastName?: string;
}): boolean {
  return Boolean(
    sanitizePersonName(parts.fullName) ||
      sanitizePersonName(parts.firstName) ||
      sanitizePersonName(parts.lastName) ||
      sanitizePersonName([parts.firstName, parts.lastName].filter(Boolean).join(" "))
  );
}
