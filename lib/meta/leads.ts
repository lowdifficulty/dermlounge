import "server-only";
import { dedupeAllContacts } from "@/lib/crm/dedupe";
import { upsertLead, addLeadNote, readLeadsData } from "@/lib/leads/store";
import { DEFAULT_MEDICAL_SERVICE, getMedicalService } from "@/lib/medical-services";
import { crmPhoneDigits, crmPhoneE164, displayNameFromContact } from "@/lib/crm/phone";
import { findContactByEmail, findContactByName } from "@/lib/crm/contact-match";
import { isMetaOnlyPhone } from "@/lib/crm/meta-contact";
import {
  findContactByPhone,
  newContactId,
  newInteractionId,
  upsertContact,
} from "@/lib/crm/store";
import type { CrmContact } from "@/lib/crm/types";
import { resolveMetaPageAccessToken, resolveMetaPageId, writeMetaRuntimeConfig } from "./config";
import { graphGet } from "./graph";

export type GraphLeadField = { name: string; values: string[] };

export type GraphLead = {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  form_id?: string;
  field_data?: GraphLeadField[];
};

type GraphList<T> = { data?: T[]; paging?: { next?: string } };

function fieldMap(fields: GraphLeadField[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields ?? []) {
    const key = field.name.trim().toLowerCase().replace(/\s+/g, "_");
    const value = (field.values ?? []).map((v) => String(v).trim()).find(Boolean);
    if (key && value) out[key] = value;
  }
  return out;
}

function pick(map: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = map[key];
    if (value) return value;
  }
  return undefined;
}

export function parseGraphLead(lead: GraphLead): {
  leadgenId: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  zipCode?: string;
  address?: string;
  note: string;
} {
  const map = fieldMap(lead.field_data);
  const fullName =
    pick(map, "full_name", "name") ||
    [pick(map, "first_name"), pick(map, "last_name")].filter(Boolean).join(" ").trim() ||
    undefined;
  const firstName = pick(map, "first_name") || fullName?.split(/\s+/)[0];
  const lastName =
    pick(map, "last_name") ||
    (fullName && fullName.split(/\s+/).length > 1
      ? fullName.split(/\s+/).slice(1).join(" ")
      : undefined);
  const email = pick(map, "email", "email_address");
  const phone = pick(map, "phone_number", "phone", "mobile", "mobile_number");
  const city = pick(map, "city");
  const zipCode = pick(map, "zip", "zip_code", "post_code", "postal_code");
  const address = pick(map, "street_address", "address");

  const extras = Object.entries(map)
    .filter(
      ([key]) =>
        ![
          "full_name",
          "name",
          "first_name",
          "last_name",
          "email",
          "email_address",
          "phone_number",
          "phone",
          "mobile",
          "mobile_number",
          "city",
          "zip",
          "zip_code",
          "post_code",
          "postal_code",
          "street_address",
          "address",
        ].includes(key)
    )
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`);

  const header = [
    "Meta Lead Ads (Wound Care)",
    lead.ad_name ? `Ad: ${lead.ad_name}` : null,
    lead.form_id ? `Form ID: ${lead.form_id}` : null,
    `Lead ID: ${lead.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    leadgenId: lead.id,
    firstName,
    lastName,
    fullName,
    email,
    phone,
    city,
    zipCode,
    address,
    note: extras.length ? `${header}\n${extras.join("\n")}` : header,
  };
}

export async function fetchGraphLead(leadgenId: string, token?: string): Promise<GraphLead> {
  const access = token || (await resolveMetaPageAccessToken());
  if (!access) throw new Error("Meta Page access token is not configured");
  return graphGet<GraphLead>(leadgenId, access, {
    fields: "id,created_time,ad_id,ad_name,form_id,field_data",
  });
}

async function fetchAllPages<T>(firstUrlPath: string, token: string, search: Record<string, string>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = firstUrlPath;
  let params: Record<string, string> | undefined = search;
  while (cursor) {
    const page: GraphList<T> = await graphGet<GraphList<T>>(cursor, token, params);
    items.push(...(page.data ?? []));
    const next = page.paging?.next;
    if (!next) break;
    const nextUrl = new URL(next);
    cursor = nextUrl.pathname.replace(/^\/v\d+\.\d+\//, "").replace(/^\//, "");
    params = Object.fromEntries(nextUrl.searchParams.entries());
    delete params.access_token;
  }
  return items;
}

export async function listPageGraphLeads(options?: { since?: Date }): Promise<GraphLead[]> {
  const token = await resolveMetaPageAccessToken();
  const pageId = await resolveMetaPageId();
  if (!token) throw new Error("Meta Page access token is not configured");
  if (!pageId) throw new Error("Meta Page ID is not configured");

  const forms = await fetchAllPages<{ id: string; name?: string }>(
    `${pageId}/leadgen_forms`,
    token,
    { fields: "id,name,status", limit: "100" }
  );

  const leadSearch: Record<string, string> = {
    fields: "id,created_time,ad_id,ad_name,form_id,field_data",
    limit: "100",
  };
  if (options?.since) {
    const unix = Math.floor(options.since.getTime() / 1000);
    leadSearch.filtering = JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: unix },
    ]);
  }

  const leads: GraphLead[] = [];
  for (const form of forms) {
    const formLeads = await fetchAllPages<GraphLead>(`${form.id}/leads`, token, leadSearch);
    leads.push(...formLeads);
  }
  return leads;
}

export type IngestResult = {
  leadgenId: string;
  created: boolean;
  updated: boolean;
  skipped: boolean;
  reason?: string;
  contactId?: string;
  leadId?: string;
};

export async function ingestGraphLead(lead: GraphLead): Promise<IngestResult> {
  const parsed = parseGraphLead(lead);
  const sessionId = `meta:${parsed.leadgenId}`;
  const existing = await readLeadsData();
  const already = existing.leads.find((l) => l.leadSessionId === sessionId);

  const digits = parsed.phone ? crmPhoneDigits(parsed.phone) : "";
  if (digits.length < 10 && !parsed.email) {
    return {
      leadgenId: parsed.leadgenId,
      created: false,
      updated: false,
      skipped: true,
      reason: "No phone or email on the Meta lead",
    };
  }

  const service = getMedicalService(DEFAULT_MEDICAL_SERVICE);
  const saved = await upsertLead({
    leadSessionId: sessionId,
    funnelStep: "contact_info",
    phone: digits.length >= 10 ? digits : undefined,
    email: parsed.email,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    fullName: parsed.fullName,
    city: parsed.city,
    zipCode: parsed.zipCode,
    address: parsed.address,
    service: service.label,
    medicalService: service.id,
    smsOptIn: false,
    source: "meta",
    message: already ? undefined : parsed.note,
  });

  if (already && parsed.note) {
    const hasNote = already.notes.some((n) => n.text.includes(parsed.leadgenId));
    if (!hasNote) await addLeadNote(saved.id, parsed.note);
  }

  if (digits.length < 10) {
    return {
      leadgenId: parsed.leadgenId,
      created: !already,
      updated: Boolean(already),
      skipped: false,
      reason: "Saved without CRM contact (no phone)",
      leadId: saved.id,
    };
  }

  const now = saved.createdAt || new Date().toISOString();
  let existingContact =
    digits.length >= 10 ? await findContactByPhone(digits) : null;
  if (!existingContact && parsed.email) {
    existingContact = await findContactByEmail(parsed.email);
  }
  if (!existingContact) {
    const nameNeedle = parsed.fullName || [parsed.firstName, parsed.lastName].filter(Boolean).join(" ");
    existingContact = await findContactByName(nameNeedle);
  }

  const upgradingMetaOnly =
    existingContact &&
    isMetaOnlyPhone(existingContact.phone) &&
    digits.length >= 10;

  const contact: CrmContact = existingContact
    ? {
        ...existingContact,
        phone: upgradingMetaOnly ? digits : existingContact.phone,
        phoneE164: upgradingMetaOnly
          ? crmPhoneE164(parsed.phone || digits) ?? `+1${digits}`
          : existingContact.phoneE164,
        firstName: parsed.firstName || existingContact.firstName,
        lastName: parsed.lastName || existingContact.lastName,
        fullName: displayNameFromContact({
          firstName: parsed.firstName || existingContact.firstName,
          lastName: parsed.lastName || existingContact.lastName,
          fullName: parsed.fullName || existingContact.fullName,
          phone: upgradingMetaOnly ? digits : existingContact.phone,
        }),
        email: parsed.email || existingContact.email,
        city: parsed.city || existingContact.city,
        zipCode: parsed.zipCode || existingContact.zipCode,
        address: parsed.address || existingContact.address,
        leadId: saved.id,
        medicalService: service.id,
        service: service.label,
        source: existingContact.source === "import" ? "meta" : existingContact.source,
        botEnabled: false,
        smsOptIn: false,
        tags: Array.from(
          new Set([...existingContact.tags, "meta", service.crmTag])
        ),
        updatedAt: now,
      }
    : {
        id: newContactId(),
        phone: digits,
        phoneE164: crmPhoneE164(parsed.phone || digits) ?? `+1${digits}`,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        fullName: displayNameFromContact({
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          fullName: parsed.fullName,
          phone: digits,
        }),
        email: parsed.email,
        city: parsed.city,
        zipCode: parsed.zipCode,
        address: parsed.address,
        pets: [],
        appointmentIds: [],
        medicalService: service.id,
        service: service.label,
        leadId: saved.id,
        status: "lead",
        tags: ["meta", service.crmTag],
        source: "meta",
        unreadCount: 0,
        botEnabled: false,
        smsOptIn: false,
        createdAt: now,
        updatedAt: now,
        lastInteractionAt: now,
      };

  const interaction =
    already && existingContact
      ? undefined
      : {
          id: newInteractionId(),
          contactId: contact.id,
          phone: digits,
          channel: "system" as const,
          direction: "internal" as const,
          summary: "Meta Lead Ads — Wound Care",
          body: parsed.note,
          actor: "system" as const,
          metadata: {
            kind: "meta_lead",
            leadgenId: parsed.leadgenId,
            formId: lead.form_id || null,
            adId: lead.ad_id || null,
            autoSms: false,
          },
          createdAt: now,
        };

  const savedContact = await upsertContact(contact, { interaction });

  return {
    leadgenId: parsed.leadgenId,
    created: !already && !existingContact,
    updated: Boolean(already || existingContact),
    skipped: false,
    contactId: savedContact.id,
    leadId: saved.id,
  };
}

export async function ingestLeadgenId(leadgenId: string): Promise<IngestResult> {
  const graphLead = await fetchGraphLead(leadgenId);
  return ingestGraphLead(graphLead);
}

export async function syncExistingMetaLeads(options?: { since?: Date }): Promise<{
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const graphLeads = await listPageGraphLeads(options);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const lead of graphLeads) {
    try {
      const result = await ingestGraphLead(lead);
      if (result.skipped) skipped += 1;
      else if (result.created) created += 1;
      else updated += 1;
    } catch (err) {
      errors.push(
        `${lead.id}: ${err instanceof Error ? err.message : "ingest failed"}`
      );
    }
  }

  await writeMetaRuntimeConfig({
    lastSyncAt: new Date().toISOString(),
    lastSyncCount: graphLeads.length,
    lastError: errors[0] || null,
  });

  await dedupeAllContacts();

  return { fetched: graphLeads.length, created, updated, skipped, errors };
}

export async function syncRecentMetaLeads(lookbackHours = 72) {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  return syncExistingMetaLeads({ since });
}
