import "server-only";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import { deleteLeadById, readLeadsData, writeLeadsData } from "@/lib/leads/store";
import type { Lead } from "@/lib/leads/types";
import { contactNameKey, normalizeContactName } from "./contact-match";
import { isMetaOnlyPhone } from "./meta-contact";
import { readCrmData, writeCrmData } from "./store";
import type { CrmContact } from "./types";

function pickLatestIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}

/** True when the contact card would show a phone number instead of a person's name. */
export function isPhoneOnlyContact(contact: Pick<CrmContact, "fullName" | "firstName" | "lastName" | "phone">): boolean {
  if (isMetaOnlyPhone(contact.phone)) return true;
  const name = contactNameKey(contact);
  if (!name) return true;
  const digits = contact.phone.replace(/\D/g, "");
  if (name.replace(/\D/g, "") === digits) return true;
  return name === normalizeContactName(formatPhoneDisplay(contact.phone));
}

function canMergeContacts(keeper: CrmContact, drop: CrmContact): boolean {
  if (keeper.metaPsid && drop.metaPsid && keeper.metaPsid !== drop.metaPsid) {
    return false;
  }
  return true;
}

function interactionCount(contactId: string, data: Awaited<ReturnType<typeof readCrmData>>): number {
  return data.interactions.filter((i) => i.contactId === contactId).length;
}

function contactKeeperScore(
  contact: CrmContact,
  data: Awaited<ReturnType<typeof readCrmData>>
): number {
  let score = interactionCount(contact.id, data) * 10;
  if (!isMetaOnlyPhone(contact.phone)) score += 100;
  if (!isPhoneOnlyContact(contact)) score += 50;
  if (contact.email) score += 20;
  if (contact.metaPsid) score += 15;
  if (contact.leadId) score += 5;
  if (contact.appointmentIds.length > 0) score += 30;
  return score;
}

function pickKeeper(contacts: CrmContact[], data: Awaited<ReturnType<typeof readCrmData>>): CrmContact {
  return [...contacts].sort(
    (a, b) => contactKeeperScore(b, data) - contactKeeperScore(a, data)
  )[0];
}

function mergeContactFields(keeper: CrmContact, drop: CrmContact): CrmContact {
  const tags = Array.from(new Set([...keeper.tags, ...drop.tags]));
  const useDropPhone =
    isMetaOnlyPhone(keeper.phone) && !isMetaOnlyPhone(drop.phone) ? drop.phone : keeper.phone;
  const useDropE164 =
    isMetaOnlyPhone(keeper.phone) && !isMetaOnlyPhone(drop.phone)
      ? drop.phoneE164
      : keeper.phoneE164;

  return {
    ...keeper,
    phone: useDropPhone,
    phoneE164: useDropE164,
    email: keeper.email || drop.email,
    firstName: keeper.firstName || drop.firstName,
    lastName: keeper.lastName || drop.lastName,
    fullName: keeper.fullName || drop.fullName,
    address: keeper.address || drop.address,
    city: keeper.city || drop.city,
    zipCode: keeper.zipCode || drop.zipCode,
    leadId: keeper.leadId || drop.leadId,
    metaPsid: keeper.metaPsid || drop.metaPsid,
    metaPlatform: keeper.metaPlatform || drop.metaPlatform,
    metaUsername: keeper.metaUsername || drop.metaUsername,
    unreadCount: (keeper.unreadCount ?? 0) + (drop.unreadCount ?? 0),
    lastInteractionAt: pickLatestIso(keeper.lastInteractionAt, drop.lastInteractionAt),
    lastInboundAt: pickLatestIso(keeper.lastInboundAt, drop.lastInboundAt),
    lastOutboundAt: pickLatestIso(keeper.lastOutboundAt, drop.lastOutboundAt),
    appointmentIds: Array.from(new Set([...keeper.appointmentIds, ...drop.appointmentIds])),
    tags,
    updatedAt: new Date().toISOString(),
  };
}

export async function mergeContactInto(
  keepId: string,
  dropId: string
): Promise<{ kept: CrmContact; removed: CrmContact } | null> {
  if (keepId === dropId) return null;

  const data = await readCrmData();
  const keeper = data.contacts.find((c) => c.id === keepId);
  const drop = data.contacts.find((c) => c.id === dropId);
  if (!keeper || !drop) return null;
  if (!canMergeContacts(keeper, drop)) return null;

  const merged = mergeContactFields(keeper, drop);

  for (const interaction of data.interactions) {
    if (interaction.contactId === dropId) {
      interaction.contactId = keepId;
    }
  }

  data.contacts = data.contacts.filter((c) => c.id !== dropId);
  const finalIdx = data.contacts.findIndex((c) => c.id === keepId);
  if (finalIdx >= 0) {
    data.contacts[finalIdx] = merged;
  }

  await writeCrmData(data);

  if (drop.leadId && drop.leadId !== keeper.leadId) {
    await deleteLeadById(drop.leadId);
  }

  return { kept: merged, removed: drop };
}

export type ContactDedupeResult = {
  merged: number;
  removedContactIds: string[];
};

async function mergeGroup(
  group: CrmContact[],
  data: Awaited<ReturnType<typeof readCrmData>>,
  removedContactIds: string[]
): Promise<number> {
  if (group.length < 2) return 0;

  let merged = 0;
  const keeper = pickKeeper(group, data);
  for (const duplicate of group) {
    if (duplicate.id === keeper.id) continue;
    if (!canMergeContacts(keeper, duplicate)) continue;
    const result = await mergeContactInto(keeper.id, duplicate.id);
    if (result) {
      merged += 1;
      removedContactIds.push(duplicate.id);
    }
  }
  return merged;
}

/** Merge contacts that share the same normalized phone. */
async function dedupeByPhone(): Promise<ContactDedupeResult> {
  const data = await readCrmData();
  const removedContactIds: string[] = [];
  let merged = 0;

  const byPhone = new Map<string, CrmContact[]>();
  for (const contact of data.contacts) {
    if (contact.phone.length < 10) continue;
    const list = byPhone.get(contact.phone) ?? [];
    list.push(contact);
    byPhone.set(contact.phone, list);
  }

  for (const group of byPhone.values()) {
    merged += await mergeGroup(group, data, removedContactIds);
  }

  return { merged, removedContactIds };
}

/** Merge contacts that share the same email. */
async function dedupeByEmail(): Promise<ContactDedupeResult> {
  const data = await readCrmData();
  const removedContactIds: string[] = [];
  let merged = 0;

  const byEmail = new Map<string, CrmContact[]>();
  for (const contact of data.contacts) {
    const email = (contact.email || "").trim().toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email) ?? [];
    list.push(contact);
    byEmail.set(email, list);
  }

  for (const group of byEmail.values()) {
    merged += await mergeGroup(group, data, removedContactIds);
  }

  return { merged, removedContactIds };
}

/** Merge Meta-only placeholder-phone contacts into a real named match. */
async function dedupeMetaOnlyByName(): Promise<ContactDedupeResult> {
  const data = await readCrmData();
  const removedContactIds: string[] = [];
  let merged = 0;

  for (const duplicate of data.contacts.filter((c) => isMetaOnlyPhone(c.phone))) {
    const name = contactNameKey(duplicate);
    if (!name) continue;

    const keeper = data.contacts.find(
      (c) =>
        c.id !== duplicate.id &&
        contactNameKey(c) === name &&
        !isMetaOnlyPhone(c.phone)
    );
    if (!keeper || !canMergeContacts(keeper, duplicate)) continue;

    const result = await mergeContactInto(keeper.id, duplicate.id);
    if (result) {
      merged += 1;
      removedContactIds.push(duplicate.id);
    }
  }

  return { merged, removedContactIds };
}

/**
 * Merge same-name duplicates when one card is phone-only (no real name)
 * or uses a Meta placeholder number.
 */
async function dedupeWeakNameMatches(): Promise<ContactDedupeResult> {
  const data = await readCrmData();
  const removedContactIds: string[] = [];
  let merged = 0;

  const byName = new Map<string, CrmContact[]>();
  for (const contact of data.contacts) {
    const name = contactNameKey(contact);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(contact);
    byName.set(name, list);
  }

  for (const group of byName.values()) {
    if (group.length < 2) continue;

    const weak = group.filter((c) => isPhoneOnlyContact(c) || isMetaOnlyPhone(c.phone));
    const strong = group.filter((c) => !isPhoneOnlyContact(c) && !isMetaOnlyPhone(c.phone));
    if (weak.length === 0 || strong.length === 0) continue;

    const keeper = pickKeeper(strong, data);
    for (const duplicate of weak) {
      if (duplicate.id === keeper.id) continue;
      if (!canMergeContacts(keeper, duplicate)) continue;
      const result = await mergeContactInto(keeper.id, duplicate.id);
      if (result) {
        merged += 1;
        removedContactIds.push(duplicate.id);
      }
    }
  }

  return { merged, removedContactIds };
}

/** Run all contact dedupe passes (safe merges only). */
export async function dedupeAllContacts(): Promise<ContactDedupeResult> {
  const removedContactIds: string[] = [];
  let merged = 0;

  for (const pass of [
    dedupeByPhone,
    dedupeByEmail,
    dedupeMetaOnlyByName,
    dedupeWeakNameMatches,
  ]) {
    const result = await pass();
    merged += result.merged;
    removedContactIds.push(...result.removedContactIds);
  }

  return { merged, removedContactIds };
}

/** @deprecated Use dedupeAllContacts — kept for callers that only need Meta-only pass. */
export async function dedupeMetaOnlyContacts(): Promise<ContactDedupeResult> {
  return dedupeAllContacts();
}

function leadNameKey(lead: Lead): string {
  const full = normalizeContactName(lead.fullName);
  if (full) return full;
  return normalizeContactName([lead.firstName, lead.lastName].filter(Boolean).join(" "));
}

function leadKeeperScore(lead: Lead): number {
  let score = 0;
  if (lead.phone?.replace(/\D/g, "").length >= 10) score += 100;
  if (lead.email) score += 50;
  if (lead.fullName || lead.firstName) score += 30;
  if (lead.notes.length > 0) score += lead.notes.length * 5;
  if (lead.appointmentId) score += 20;
  return score;
}

/** Remove duplicate lead records for the same person (phone, email, or name). */
export async function dedupeLeads(): Promise<{ removed: number; removedLeadIds: string[] }> {
  const data = await readLeadsData();
  const removedLeadIds: string[] = [];

  function dropDuplicates(groups: Map<string, Lead[]>): void {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => leadKeeperScore(b) - leadKeeperScore(a));
      const [, ...drops] = sorted;
      for (const lead of drops) {
        const idx = data.leads.findIndex((l) => l.id === lead.id);
        if (idx >= 0) {
          data.leads.splice(idx, 1);
          removedLeadIds.push(lead.id);
        }
      }
    }
  }

  const byPhone = new Map<string, Lead[]>();
  const byEmail = new Map<string, Lead[]>();
  const byName = new Map<string, Lead[]>();

  for (const lead of data.leads) {
    const phone = lead.phone?.replace(/\D/g, "") ?? "";
    if (phone.length >= 10) {
      const list = byPhone.get(phone) ?? [];
      list.push(lead);
      byPhone.set(phone, list);
    }

    const email = lead.email?.trim().toLowerCase();
    if (email) {
      const list = byEmail.get(email) ?? [];
      list.push(lead);
      byEmail.set(email, list);
    }

    const name = leadNameKey(lead);
    if (name) {
      const list = byName.get(name) ?? [];
      list.push(lead);
      byName.set(name, list);
    }
  }

  dropDuplicates(byPhone);
  dropDuplicates(byEmail);

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const weak = group.filter((l) => !l.phone || l.phone.replace(/\D/g, "").length < 10);
    const strong = group.filter((l) => l.phone && l.phone.replace(/\D/g, "").length >= 10);
    if (weak.length === 0 || strong.length === 0) continue;
    const sorted = [...weak].sort((a, b) => leadKeeperScore(b) - leadKeeperScore(a));
    for (const lead of sorted) {
      const idx = data.leads.findIndex((l) => l.id === lead.id);
      if (idx >= 0) {
        data.leads.splice(idx, 1);
        removedLeadIds.push(lead.id);
      }
    }
  }

  if (removedLeadIds.length > 0) {
    await writeLeadsData(data);
  }

  return { removed: removedLeadIds.length, removedLeadIds };
}
