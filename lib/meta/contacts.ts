import "server-only";
import { createHash } from "crypto";
import { readLeadsData } from "@/lib/leads/store";
import {
  findContactByMetaPsid,
  findContactByPhone,
  newContactId,
  readCrmData,
  upsertContact,
} from "@/lib/crm/store";
import { crmPhoneDigits, crmPhoneE164, displayNameFromContact } from "@/lib/crm/phone";
import type { CrmContact, MetaPlatform } from "@/lib/crm/types";
import { fetchMetaUserProfile, type MetaUserProfile } from "./client";

/** Deterministic placeholder phone for Meta-only contacts (8xxxxxxxx). */
export function metaSyntheticPhone(psid: string): string {
  const hash = createHash("sha256").update(psid).digest("hex");
  const num = (parseInt(hash.slice(0, 8), 16) % 900_000_000) + 8_000_000_000;
  return String(num).slice(0, 10);
}

function normalizeName(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function findContactByName(name?: string): Promise<CrmContact | null> {
  const needle = normalizeName(name);
  if (!needle) return null;
  const data = await readCrmData();
  const matches = data.contacts.filter((c) => {
    const full = normalizeName(c.fullName);
    const joined = normalizeName([c.firstName, c.lastName].filter(Boolean).join(" "));
    return full === needle || joined === needle;
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return matches.sort((a, b) =>
      (b.lastInteractionAt || b.updatedAt).localeCompare(a.lastInteractionAt || a.updatedAt)
    )[0];
  }

  const { leads } = await readLeadsData();
  const leadMatches = leads.filter((l) => {
    const full = normalizeName(l.fullName);
    const joined = normalizeName([l.firstName, l.lastName].filter(Boolean).join(" "));
    return full === needle || joined === needle;
  });
  if (leadMatches.length === 1) {
    const lead = leadMatches[0];
    const byPhone = lead.phone ? await findContactByPhone(lead.phone) : null;
    if (byPhone) return byPhone;
  }

  return null;
}

async function findContactByEmail(email?: string): Promise<CrmContact | null> {
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

export async function attachMetaToContact(
  contact: CrmContact,
  options: {
    psid: string;
    platform: MetaPlatform;
    profile?: MetaUserProfile | null;
  }
): Promise<CrmContact> {
  const now = new Date().toISOString();
  const profile = options.profile;
  const tags = [...contact.tags];
  if (!tags.includes("meta-dm")) tags.push("meta-dm");

  const updated: CrmContact = {
    ...contact,
    metaPsid: options.psid,
    metaPlatform: options.platform,
    metaUsername: profile?.username || contact.metaUsername,
    firstName: profile?.first_name || contact.firstName,
    lastName: profile?.last_name || contact.lastName,
    fullName:
      profile?.name ||
      displayNameFromContact({
        firstName: profile?.first_name || contact.firstName,
        lastName: profile?.last_name || contact.lastName,
        fullName: contact.fullName,
      }),
    tags,
    updatedAt: now,
  };
  return upsertContact(updated);
}

export async function resolveOrCreateMetaContact(options: {
  psid: string;
  platform: MetaPlatform;
  profile?: MetaUserProfile | null;
  participantEmail?: string;
  participantPhone?: string;
}): Promise<CrmContact> {
  const existingByPsid = await findContactByMetaPsid(options.psid);
  if (existingByPsid) {
    return attachMetaToContact(existingByPsid, options);
  }

  const profile = options.profile ?? (await fetchMetaUserProfile(options.psid));

  if (options.participantPhone) {
    const byPhone = await findContactByPhone(options.participantPhone);
    if (byPhone && !byPhone.metaPsid) {
      return attachMetaToContact(byPhone, { ...options, profile });
    }
  }

  const byEmail = await findContactByEmail(options.participantEmail);
  if (byEmail && !byEmail.metaPsid) {
    return attachMetaToContact(byEmail, { ...options, profile });
  }

  const byName = await findContactByName(profile?.name);
  if (byName && !byName.metaPsid) {
    return attachMetaToContact(byName, { ...options, profile });
  }

  const now = new Date().toISOString();
  const syntheticPhone = metaSyntheticPhone(options.psid);
  const contact: CrmContact = {
    id: newContactId(),
    phone: syntheticPhone,
    phoneE164: crmPhoneE164(syntheticPhone) ?? `+1${syntheticPhone}`,
    firstName: profile?.first_name,
    lastName: profile?.last_name,
    fullName: profile?.name || displayNameFromContact({ phone: syntheticPhone }),
    pets: [],
    appointmentIds: [],
    status: "lead",
    tags: ["meta-dm"],
    source: "meta",
    medicalService: "wound_care",
    unreadCount: 0,
    botEnabled: true,
    metaPsid: options.psid,
    metaPlatform: options.platform,
    createdAt: now,
    updatedAt: now,
  };
  return upsertContact(contact);
}

export function isMetaOnlyPhone(phone: string): boolean {
  const digits = crmPhoneDigits(phone);
  return digits.startsWith("8") && digits.length === 10;
}

export function pageScopedParticipantId(
  participants: { id?: string; name?: string; email?: string }[] | undefined,
  pageId: string
): { psid: string; name?: string; email?: string } | null {
  if (!participants?.length) return null;
  const customer = participants.find((p) => p.id && p.id !== pageId);
  if (!customer?.id) return null;
  return { psid: customer.id, name: customer.name, email: customer.email };
}
