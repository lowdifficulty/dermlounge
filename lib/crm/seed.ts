import "server-only";
import { randomUUID } from "crypto";
import { readLeadsData } from "@/lib/leads/store";
import { readSchedulingData } from "@/lib/scheduling/store";
import { readClientsData } from "@/lib/payments/store";
import type { Lead } from "@/lib/leads/types";
import type { Appointment } from "@/lib/scheduling/types";
import type { ClientAccount } from "@/lib/payments/types";
import {
  CRM_DATA_VERSION,
  emptyCrmData,
  readCrmData,
  writeCrmData,
} from "./store";
import {
  DEFAULT_MEDICAL_SERVICE,
  getMedicalService,
  resolveMedicalServiceId,
} from "@/lib/medical-services";
import { crmPhoneDigits, crmPhoneE164, displayNameFromContact } from "./phone";
import type {
  CrmContact,
  CrmContactSource,
  CrmContactStatus,
  CrmData,
  CrmInteraction,
  CrmPet,
} from "./types";

function mergePets(
  existing: CrmPet[],
  next: CrmPet[]
): CrmPet[] {
  const map = new Map<string, CrmPet>();
  for (const pet of [...existing, ...next]) {
    const key = `${pet.petName.trim().toLowerCase()}|${pet.petSize ?? ""}`;
    if (!pet.petName.trim() && !pet.petSize) continue;
    const prev = map.get(key);
    map.set(key, {
      petName: pet.petName || prev?.petName || "",
      petSize: pet.petSize || prev?.petSize,
      petBreed: pet.petBreed || prev?.petBreed,
    });
  }
  return [...map.values()];
}

function leadSource(lead: Lead): CrmContactSource {
  return lead.source as CrmContactSource;
}

function statusFromLead(lead: Lead, hasUpcoming: boolean, hasPast: boolean): CrmContactStatus {
  if (lead.listStatus === "cold_storage") return "inactive";
  if (hasUpcoming || lead.funnelStep === "scheduled" || lead.funnelStep === "appointment_completed") {
    return "customer";
  }
  if (hasPast) return "customer";
  return "lead";
}

function petsFromLead(lead: Lead): CrmPet[] {
  if (lead.pets?.length) {
    return lead.pets.map((p) => ({
      petName: p.petName || "",
      petSize: p.petSize,
    }));
  }
  if (lead.petName || lead.petSize) {
    return [{ petName: lead.petName || "", petSize: lead.petSize }];
  }
  return [];
}

function petsFromAppointment(appt: Appointment): CrmPet[] {
  const pets: CrmPet[] = [
    {
      petName: appt.petName || "",
      petSize: appt.petSize,
      petBreed: appt.petBreed || undefined,
    },
  ];
  for (const extra of appt.additionalPets ?? []) {
    pets.push({ petName: extra.petName || "", petSize: extra.petSize });
  }
  return pets;
}

function buildContactShell(phone: string, now: string): CrmContact {
  const e164 = crmPhoneE164(phone) ?? `+1${phone}`;
  return {
    id: randomUUID(),
    phone,
    phoneE164: e164,
    pets: [],
    appointmentIds: [],
    status: "lead",
    tags: [],
    source: "import",
    unreadCount: 0,
    botEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function applyLead(contact: CrmContact, lead: Lead, nowIso: string): void {
  contact.leadId = lead.id;
  contact.firstName = lead.firstName || contact.firstName;
  contact.lastName = lead.lastName || contact.lastName;
  contact.fullName =
    lead.fullName ||
    displayNameFromContact({
      firstName: lead.firstName || contact.firstName,
      lastName: lead.lastName || contact.lastName,
      fullName: contact.fullName,
    });
  contact.email = lead.email || contact.email;
  contact.address = lead.address || contact.address;
  contact.city = lead.city || contact.city;
  contact.zipCode = lead.zipCode || contact.zipCode;
  contact.service = lead.service || contact.service;
  const serviceId = resolveMedicalServiceId({
    medicalService: lead.medicalService,
    service: lead.service,
    tags: contact.tags,
  });
  contact.medicalService = serviceId;
  const def = getMedicalService(serviceId);
  if (!contact.tags.includes(def.crmTag)) contact.tags.push(def.crmTag);
  contact.smsOptIn = lead.smsOptIn ?? contact.smsOptIn;
  contact.groomerId = lead.groomerId || contact.groomerId;
  contact.groomerName = lead.groomerName || contact.groomerName;
  contact.source = leadSource(lead);
  contact.pets = mergePets(contact.pets, petsFromLead(lead));
  if (lead.appointmentId && !contact.appointmentIds.includes(lead.appointmentId)) {
    contact.appointmentIds.push(lead.appointmentId);
  }
  contact.createdAt =
    lead.createdAt < contact.createdAt ? lead.createdAt : contact.createdAt;
  contact.updatedAt = lead.updatedAt > contact.updatedAt ? lead.updatedAt : contact.updatedAt;
  if (lead.followUpMode === "fu") {
    if (!contact.tags.includes("follow-up")) contact.tags.push("follow-up");
  }
  if (lead.funnelStep && !["scheduled", "appointment_completed"].includes(lead.funnelStep)) {
    if (!contact.tags.includes("abandoned-funnel")) contact.tags.push("abandoned-funnel");
  }
  if (lead.smsOptIn && !contact.tags.includes("sms-opt-in")) {
    contact.tags.push("sms-opt-in");
  }
  if (lead.source === "heyflow" && !contact.tags.includes("heyflow")) {
    contact.tags.push("heyflow");
  }
  if (lead.source === "meta") {
    contact.botEnabled = false;
    contact.smsOptIn = false;
    if (!contact.tags.includes("meta")) contact.tags.push("meta");
  }
  void nowIso;
}

function applyAppointment(contact: CrmContact, appt: Appointment): void {
  if (!contact.appointmentIds.includes(appt.id)) {
    contact.appointmentIds.push(appt.id);
  }
  contact.firstName = appt.firstName || contact.firstName;
  contact.lastName = appt.lastName || contact.lastName;
  contact.fullName = displayNameFromContact({
    firstName: appt.firstName || contact.firstName,
    lastName: appt.lastName || contact.lastName,
    fullName: contact.fullName,
  });
  contact.email = appt.email || contact.email;
  contact.address = appt.address || contact.address;
  contact.city = appt.city || contact.city;
  contact.zipCode = appt.zipCode || contact.zipCode;
  contact.service = appt.service || contact.service;
  contact.smsOptIn = appt.smsOptIn ?? contact.smsOptIn;
  contact.groomerId = appt.groomerId || contact.groomerId;
  contact.pets = mergePets(contact.pets, petsFromAppointment(appt));
  if (contact.source === "import") contact.source = "appointment";
  if (appt.smsOptIn && !contact.tags.includes("sms-opt-in")) {
    contact.tags.push("sms-opt-in");
  }
  contact.createdAt =
    appt.createdAt < contact.createdAt ? appt.createdAt : contact.createdAt;
  contact.updatedAt =
    appt.createdAt > contact.updatedAt ? appt.createdAt : contact.updatedAt;
}

function applyClient(contact: CrmContact, client: ClientAccount): void {
  contact.clientAccountId = client.id;
  contact.firstName = client.firstName || contact.firstName;
  contact.lastName = client.lastName || contact.lastName;
  contact.fullName = displayNameFromContact({
    firstName: client.firstName || contact.firstName,
    lastName: client.lastName || contact.lastName,
    fullName: contact.fullName,
  });
  contact.email = client.email || contact.email;
  if (client.serviceAddress) {
    contact.address = client.serviceAddress.address || contact.address;
    contact.city = client.serviceAddress.city || contact.city;
    contact.zipCode = client.serviceAddress.zipCode || contact.zipCode;
  }
  if (client.petProfile?.pets?.length) {
    contact.pets = mergePets(
      contact.pets,
      client.petProfile.pets.map((p) => ({
        petName: p.petName || "",
        petSize: p.petSize,
      }))
    );
  }
  for (const id of client.appointmentIds ?? []) {
    if (!contact.appointmentIds.includes(id)) contact.appointmentIds.push(id);
  }
  if (!contact.tags.includes("portal-account")) contact.tags.push("portal-account");
  if (contact.source === "import" || contact.source === "appointment") {
    contact.source = "client_portal";
  }
  contact.createdAt =
    client.createdAt < contact.createdAt ? client.createdAt : contact.createdAt;
}

function noteInteractionsFromLead(contact: CrmContact, lead: Lead): CrmInteraction[] {
  return (lead.notes ?? []).map((note) => ({
    id: randomUUID(),
    contactId: contact.id,
    phone: contact.phone,
    channel: "note" as const,
    direction: "internal" as const,
    body: note.text,
    actor: "staff" as const,
    createdAt: note.createdAt,
    metadata: { leadNoteId: note.id },
  }));
}

function appointmentSystemEvents(
  contact: CrmContact,
  appt: Appointment
): CrmInteraction[] {
  return [
    {
      id: randomUUID(),
      contactId: contact.id,
      phone: contact.phone,
      channel: "system",
      direction: "internal",
      summary: `Appointment ${appt.status}: ${appt.petName || "pet"} — ${appt.service}`,
      body: `${appt.firstName} ${appt.lastName} booked ${appt.service} for ${appt.petName || "their pet"} on ${appt.startAt}.`,
      actor: "system",
      createdAt: appt.createdAt,
      metadata: {
        appointmentId: appt.id,
        groomerId: appt.groomerId,
        startAt: appt.startAt,
      },
    },
  ];
}

export function buildCrmFromSources(input: {
  leads: Lead[];
  appointments: Appointment[];
  clients: ClientAccount[];
}): CrmData {
  const now = new Date().toISOString();
  const byPhone = new Map<string, CrmContact>();
  const interactions: CrmInteraction[] = [];
  const nowMs = Date.now();

  for (const lead of input.leads) {
    const phone = crmPhoneDigits(lead.phone || "");
    if (phone.length < 10) continue;
    let contact = byPhone.get(phone);
    if (!contact) {
      contact = buildContactShell(phone, lead.createdAt || now);
      byPhone.set(phone, contact);
    }
    applyLead(contact, lead, now);
  }

  for (const appt of input.appointments) {
    const phone = crmPhoneDigits(appt.phone || "");
    if (phone.length < 10) continue;
    let contact = byPhone.get(phone);
    if (!contact) {
      contact = buildContactShell(phone, appt.createdAt || now);
      byPhone.set(phone, contact);
    }
    applyAppointment(contact, appt);
  }

  for (const client of input.clients) {
    const phone = crmPhoneDigits(client.phone || "");
    if (phone.length < 10) continue;
    let contact = byPhone.get(phone);
    if (!contact) {
      contact = buildContactShell(phone, client.createdAt || now);
      byPhone.set(phone, contact);
    }
    applyClient(contact, client);
  }

  const apptsById = new Map(input.appointments.map((a) => [a.id, a]));
  const leadsByPhone = new Map<string, Lead[]>();
  for (const lead of input.leads) {
    const phone = crmPhoneDigits(lead.phone || "");
    if (phone.length < 10) continue;
    const list = leadsByPhone.get(phone) ?? [];
    list.push(lead);
    leadsByPhone.set(phone, list);
  }

  for (const contact of byPhone.values()) {
    const relatedAppts = contact.appointmentIds
      .map((id) => apptsById.get(id))
      .filter((a): a is Appointment => Boolean(a));
    // Also attach appointments matching phone even if id missing on lead
    for (const appt of input.appointments) {
      if (crmPhoneDigits(appt.phone) === contact.phone && !relatedAppts.includes(appt)) {
        relatedAppts.push(appt);
        if (!contact.appointmentIds.includes(appt.id)) {
          contact.appointmentIds.push(appt.id);
        }
      }
    }

    const hasUpcoming = relatedAppts.some(
      (a) => a.status === "confirmed" && new Date(a.startAt).getTime() >= nowMs
    );
    const hasPast = relatedAppts.some(
      (a) => a.status === "confirmed" && new Date(a.startAt).getTime() < nowMs
    );

    const primaryLead = (leadsByPhone.get(contact.phone) ?? []).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    )[0];
    if (primaryLead) {
      contact.status = statusFromLead(primaryLead, hasUpcoming, hasPast);
    } else if (hasUpcoming || hasPast || contact.clientAccountId) {
      contact.status = "customer";
    }

    if (hasUpcoming && !contact.tags.includes("upcoming")) contact.tags.push("upcoming");
    if (hasPast && !contact.tags.includes("past-client")) contact.tags.push("past-client");

    for (const lead of leadsByPhone.get(contact.phone) ?? []) {
      interactions.push(...noteInteractionsFromLead(contact, lead));
    }
    for (const appt of relatedAppts) {
      interactions.push(...appointmentSystemEvents(contact, appt));
    }

    const lastIx = interactions
      .filter((i) => i.contactId === contact.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (lastIx) {
      contact.lastInteractionAt = lastIx.createdAt;
      if (lastIx.direction === "inbound") contact.lastInboundAt = lastIx.createdAt;
      if (lastIx.direction === "outbound") contact.lastOutboundAt = lastIx.createdAt;
    }

    contact.fullName = displayNameFromContact(contact);
    contact.tags = [...new Set(contact.tags)].sort();
  }

  const contacts = [...byPhone.values()].sort((a, b) =>
    (b.lastInteractionAt || b.updatedAt).localeCompare(a.lastInteractionAt || a.updatedAt)
  );

  interactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    contacts,
    interactions,
    seededAt: now,
    version: CRM_DATA_VERSION,
  };
}

/** Build CRM snapshot from live lead/appointment/client stores. */
export async function buildCrmSnapshot(): Promise<CrmData> {
  const [leadsData, scheduling, clientsData] = await Promise.all([
    readLeadsData(),
    readSchedulingData(),
    readClientsData(),
  ]);
  return buildCrmFromSources({
    leads: leadsData.leads,
    appointments: scheduling.appointments,
    clients: clientsData.clients,
  });
}

/**
 * Ensure CRM is populated. Re-seeds when empty or when `force` is true.
 * Merges carefully: force replaces the whole CRM dataset from source systems.
 */
export async function ensureCrmSeeded(options?: {
  force?: boolean;
}): Promise<CrmData> {
  const existing = await readCrmData();
  if (!options?.force && existing.contacts.length > 0) {
    return existing;
  }

  const snapshot = await buildCrmSnapshot();
  if (snapshot.contacts.length === 0) {
    const empty = emptyCrmData();
    empty.seededAt = new Date().toISOString();
    await writeCrmData(empty);
    return empty;
  }

  await writeCrmData(snapshot);
  return snapshot;
}

/** Refresh contact records from source systems while keeping live SMS/call interactions. */
export async function refreshCrmContactsPreservingLiveInteractions(): Promise<CrmData> {
  const existing = await readCrmData();
  const snapshot = await buildCrmSnapshot();

  const liveChannels = new Set(["sms", "call"]);

  function systemSmsKey(ix: CrmInteraction): string | null {
    if (ix.channel !== "sms" || ix.direction !== "outbound" || ix.actor !== "system") {
      return null;
    }
    const kind = ix.metadata?.kind;
    if (typeof kind !== "string") return null;
    return `${crmPhoneDigits(ix.phone)}:${kind}:${String(ix.metadata?.appointmentId ?? "")}`;
  }

  function isSyntheticPlaceholder(ix: CrmInteraction): boolean {
    if (ix.actor !== "system" || ix.channel !== "sms") return false;
    const body = ix.body ?? "";
    return body.includes("historical") || body.endsWith(" sent.");
  }

  const preservedSystemSmsKeys = new Set(
    existing.interactions
      .filter(
        (i) =>
          systemSmsKey(i) &&
          i.twilioSid?.trim() &&
          i.body &&
          !isSyntheticPlaceholder(i)
      )
      .map((i) => systemSmsKey(i)!)
  );

  const liveInteractions = existing.interactions.filter((i) => {
    const key = systemSmsKey(i);
    if (key) {
      return Boolean(i.twilioSid?.trim() && i.body && !isSyntheticPlaceholder(i));
    }
    return liveChannels.has(i.channel) && i.actor !== "system";
  });

  // Remap live interactions onto refreshed contact ids by phone
  const phoneToContact = new Map(snapshot.contacts.map((c) => [c.phone, c]));
  const remapped: CrmInteraction[] = liveInteractions.map((ix) => {
    const contact = phoneToContact.get(crmPhoneDigits(ix.phone));
    if (!contact) return ix;
    return { ...ix, contactId: contact.id, phone: contact.phone };
  });

  for (const ix of remapped) {
    const contact = phoneToContact.get(ix.phone);
    if (!contact) continue;
    contact.lastInteractionAt = ix.createdAt;
    if (ix.direction === "inbound") {
      contact.lastInboundAt = ix.createdAt;
      if (ix.channel === "sms" || ix.channel === "call") {
        contact.unreadCount = (contact.unreadCount ?? 0) + 1;
      }
    }
    if (ix.direction === "outbound") contact.lastOutboundAt = ix.createdAt;
  }

  const snapshotInteractions = snapshot.interactions.filter((ix) => {
    const key = systemSmsKey(ix);
    if (key && preservedSystemSmsKeys.has(key)) return false;
    return true;
  });

  const data: CrmData = {
    contacts: snapshot.contacts,
    interactions: [...snapshotInteractions, ...remapped].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    ),
    seededAt: new Date().toISOString(),
    version: CRM_DATA_VERSION,
  };
  await writeCrmData(data);
  return data;
}
