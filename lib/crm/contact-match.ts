import "server-only";
import { readLeadsData } from "@/lib/leads/store";
import { findContactByPhone, readCrmData } from "./store";
import type { CrmContact } from "./types";

export function normalizeContactName(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function contactNameKey(contact: Pick<CrmContact, "fullName" | "firstName" | "lastName">): string {
  const full = normalizeContactName(contact.fullName);
  if (full) return full;
  return normalizeContactName([contact.firstName, contact.lastName].filter(Boolean).join(" "));
}

export async function findContactByName(name?: string): Promise<CrmContact | null> {
  const needle = normalizeContactName(name);
  if (!needle) return null;

  const data = await readCrmData();
  const matches = data.contacts.filter((c) => contactNameKey(c) === needle);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return matches.sort((a, b) =>
      (b.lastInteractionAt || b.updatedAt).localeCompare(a.lastInteractionAt || a.updatedAt)
    )[0];
  }

  const { leads } = await readLeadsData();
  const leadMatches = leads.filter((l) => {
    const full = normalizeContactName(l.fullName);
    const joined = normalizeContactName([l.firstName, l.lastName].filter(Boolean).join(" "));
    return full === needle || joined === needle;
  });
  if (leadMatches.length === 1) {
    const lead = leadMatches[0];
    if (lead.phone) {
      const byPhone = await findContactByPhone(lead.phone);
      if (byPhone) return byPhone;
    }
  }

  return null;
}

export async function findContactByEmail(email?: string): Promise<CrmContact | null> {
  const needle = (email || "").trim().toLowerCase();
  if (!needle) return null;
  const data = await readCrmData();
  const matches = data.contacts.filter((c) => (c.email || "").trim().toLowerCase() === needle);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return matches.sort((a, b) =>
      (b.lastInteractionAt || b.updatedAt).localeCompare(a.lastInteractionAt || a.updatedAt)
    )[0];
  }
  return null;
}
