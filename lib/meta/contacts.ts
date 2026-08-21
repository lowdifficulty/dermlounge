import "server-only";
import { createHash } from "crypto";
import {
  findContactByMetaPsid,
  findContactByPhone,
  newContactId,
  upsertContact,
} from "@/lib/crm/store";
import { crmPhoneE164, displayNameFromContact } from "@/lib/crm/phone";
import { isMetaOnlyPhone } from "@/lib/crm/meta-contact";
import { findContactByEmail, findContactByName } from "@/lib/crm/contact-match";
import {
  hasRealPersonName,
  sanitizePersonName,
} from "@/lib/crm/name-validation";
import type { CrmContact, MetaPlatform } from "@/lib/crm/types";
import { fetchMetaUserProfile, type MetaUserProfile } from "./client";

/** Deterministic placeholder phone for Meta-only contacts (8xxxxxxxx). */
export function metaSyntheticPhone(psid: string): string {
  const hash = createHash("sha256").update(psid).digest("hex");
  const num = (parseInt(hash.slice(0, 8), 16) % 900_000_000) + 8_000_000_000;
  return String(num).slice(0, 10);
}

function sanitizeProfile(profile?: MetaUserProfile | null): MetaUserProfile | null {
  if (!profile) return null;
  return {
    ...profile,
    name: sanitizePersonName(profile.name),
    first_name: sanitizePersonName(profile.first_name),
    last_name: sanitizePersonName(profile.last_name),
  };
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
  const profile = sanitizeProfile(options.profile);
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
}): Promise<CrmContact | null> {
  const existingByPsid = await findContactByMetaPsid(options.psid);
  if (existingByPsid) {
    return attachMetaToContact(existingByPsid, options);
  }

  const profile = sanitizeProfile(
    options.profile ?? (await fetchMetaUserProfile(options.psid))
  );

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
  if (byName && (!byName.metaPsid || byName.metaPsid === options.psid)) {
    return attachMetaToContact(byName, { ...options, profile });
  }

  if (!hasRealPersonName({
    fullName: profile?.name,
    firstName: profile?.first_name,
    lastName: profile?.last_name,
  })) {
    return null;
  }

  const now = new Date().toISOString();
  const syntheticPhone = metaSyntheticPhone(options.psid);
  const contact: CrmContact = {
    id: newContactId(),
    phone: syntheticPhone,
    phoneE164: crmPhoneE164(syntheticPhone) ?? `+1${syntheticPhone}`,
    firstName: profile?.first_name,
    lastName: profile?.last_name,
    fullName: profile?.name,
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

export { isMetaOnlyPhone };

export function pageScopedParticipantId(
  participants: { id?: string; name?: string; email?: string }[] | undefined,
  pageId: string
): { psid: string; name?: string; email?: string } | null {
  if (!participants?.length) return null;
  const customer = participants.find((p) => p.id && p.id !== pageId);
  if (!customer?.id) return null;
  return {
    psid: customer.id,
    name: sanitizePersonName(customer.name),
    email: customer.email,
  };
}
