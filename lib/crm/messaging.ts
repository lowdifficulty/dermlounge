import "server-only";
import { sendSms } from "@/lib/notifications/twilio";
import type { Appointment } from "@/lib/scheduling/types";
import { ensureCrmSeeded } from "./seed";
import {
  appendInteraction,
  findContactById,
  findContactByPhone,
  newContactId,
  newInteractionId,
  readCrmData,
  updateInteraction,
  upsertContact,
} from "./store";
import {
  DEFAULT_MEDICAL_SERVICE,
  getMedicalService,
} from "@/lib/medical-services";
import { crmPhoneDigits, crmPhoneE164, displayNameFromContact } from "./phone";
import type { CrmContact, CrmInteraction, CrmPet } from "./types";
import { pipelineStatusAfterAppointment } from "./pipeline";

function mergePetsFromAppointment(existing: CrmPet[], appointment: Appointment): CrmPet[] {
  const next: CrmPet[] = [
    {
      petName: appointment.petName || "",
      petSize: appointment.petSize,
      petBreed: appointment.petBreed || undefined,
    },
    ...(appointment.additionalPets ?? []).map((pet) => ({
      petName: pet.petName || "",
      petSize: pet.petSize,
    })),
  ];
  const map = new Map<string, CrmPet>();
  for (const pet of [...existing, ...next]) {
    const key = `${pet.petName.trim().toLowerCase()}|${pet.petSize ?? ""}`;
    if (!pet.petName.trim() && !pet.petSize) continue;
    map.set(key, pet);
  }
  return [...map.values()];
}

/** Ensure a CRM contact exists for an appointment phone, merging booking details. */
export async function ensureContactFromAppointment(appointment: Appointment): Promise<CrmContact> {
  await ensureCrmSeeded();
  const digits = crmPhoneDigits(appointment.phone);
  if (digits.length < 10) {
    throw new Error("Appointment phone is invalid for CRM");
  }

  let contact = await findContactByPhone(appointment.phone);
  const now = new Date().toISOString();

  if (!contact) {
    contact = {
      id: newContactId(),
      phone: digits,
      phoneE164: crmPhoneE164(appointment.phone) ?? `+1${digits}`,
      pets: [],
      appointmentIds: [],
      status: "appointment",
      tags: [],
      source: "appointment",
      unreadCount: 0,
      botEnabled: true,
      createdAt: appointment.createdAt || now,
      updatedAt: now,
    };
  }

  const tags = [...contact.tags];
  if (appointment.smsOptIn && !tags.includes("sms-opt-in")) tags.push("sms-opt-in");

  const updated: CrmContact = {
    ...contact,
    firstName: appointment.firstName || contact.firstName,
    lastName: appointment.lastName || contact.lastName,
    fullName: displayNameFromContact({
      firstName: appointment.firstName || contact.firstName,
      lastName: appointment.lastName || contact.lastName,
      fullName: contact.fullName,
    }),
    email: appointment.email || contact.email,
    address: appointment.address || contact.address,
    city: appointment.city || contact.city,
    zipCode: appointment.zipCode || contact.zipCode,
    service: appointment.service || contact.service,
    smsOptIn: appointment.smsOptIn ?? contact.smsOptIn,
    groomerId: appointment.groomerId || contact.groomerId,
    pets: mergePetsFromAppointment(contact.pets, appointment),
    appointmentIds: contact.appointmentIds.includes(appointment.id)
      ? contact.appointmentIds
      : [...contact.appointmentIds, appointment.id],
    status: pipelineStatusAfterAppointment(contact.status),
    source: contact.source === "import" ? "appointment" : contact.source,
    tags,
    updatedAt: now,
  };

  return upsertContact(updated);
}

function systemSmsDedupeKey(
  phone: string,
  appointmentId: string,
  kind: string
): string {
  return `${crmPhoneDigits(phone)}:${kind}:${appointmentId}`;
}

async function findSystemSmsInteraction(
  phone: string,
  appointmentId: string,
  kind: string
): Promise<CrmInteraction | null> {
  const data = await readCrmData();
  const key = systemSmsDedupeKey(phone, appointmentId, kind);
  return (
    data.interactions.find((ix) => {
      if (ix.channel !== "sms" || ix.direction !== "outbound" || ix.actor !== "system") {
        return false;
      }
      const ixKind = ix.metadata?.kind;
      const ixAppt = ix.metadata?.appointmentId;
      if (typeof ixKind !== "string" || typeof ixAppt !== "string") return false;
      return systemSmsDedupeKey(ix.phone, ixAppt, ixKind) === key;
    }) ?? null
  );
}

/** Log an automated outbound SMS in CRM after Twilio confirms send. */
export async function recordSystemOutboundSms(options: {
  appointment: Appointment;
  body: string;
  summary: string;
  twilioSid?: string;
  createdAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  if (!options.twilioSid?.trim()) return;

  const contact = await ensureContactFromAppointment(options.appointment);
  const kind = String(options.metadata?.kind ?? "");
  const appointmentId = options.appointment.id;
  const existing = await findSystemSmsInteraction(contact.phone, appointmentId, kind);

  if (existing) {
    const patch: Partial<CrmInteraction> = {};
    if (options.body && existing.body !== options.body) patch.body = options.body;
    if (options.twilioSid && existing.twilioSid !== options.twilioSid) {
      patch.twilioSid = options.twilioSid;
    }
    if (Object.keys(patch).length > 0) {
      await updateInteraction(existing.id, patch);
    }
    return;
  }

  await appendInteraction({
    id: newInteractionId(),
    contactId: contact.id,
    phone: contact.phone,
    channel: "sms",
    direction: "outbound",
    body: options.body,
    summary: options.summary,
    messageStatus: "sent",
    twilioSid: options.twilioSid,
    actor: "system",
    createdAt: options.createdAt ?? new Date().toISOString(),
    metadata: options.metadata,
  });
}

export async function ensureContactForPhone(phone: string): Promise<CrmContact> {
  const existing = await findContactByPhone(phone);
  if (existing) return existing;

  const digits = crmPhoneDigits(phone);
  const now = new Date().toISOString();
  const def = getMedicalService(DEFAULT_MEDICAL_SERVICE);
  const contact: CrmContact = {
    id: newContactId(),
    phone: digits,
    phoneE164: crmPhoneE164(phone) ?? `+1${digits}`,
    fullName: undefined,
    pets: [],
    appointmentIds: [],
    medicalService: DEFAULT_MEDICAL_SERVICE,
    service: def.label,
    status: "lead",
    tags: ["sms-inbound", def.crmTag],
    source: "contact",
    unreadCount: 0,
    botEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
  return upsertContact(contact);
}

export async function sendStaffSms(options: {
  phone: string;
  body: string;
  staffUserId?: string;
  staffName?: string;
  contactId?: string;
}): Promise<{ ok: boolean; interaction?: CrmInteraction; error?: string }> {
  const body = options.body.trim();
  if (!body) return { ok: false, error: "Message body is required" };

  const contact =
    (options.contactId ? await findContactById(options.contactId) : null) ||
    (await findContactByPhone(options.phone)) ||
    (await ensureContactForPhone(options.phone));

  const result = await sendSms(contact.phoneE164 || contact.phone, body);
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: contact.id,
    phone: contact.phone,
    channel: "sms",
    direction: "outbound",
    body,
    summary: "Staff SMS",
    messageStatus: result.ok ? "sent" : "failed",
    twilioSid: result.sid,
    actor: "staff",
    staffUserId: options.staffUserId,
    staffName: options.staffName,
    createdAt: now,
    metadata: result.error ? { error: result.error } : undefined,
  };
  await appendInteraction(interaction);
  return { ok: result.ok, interaction, error: result.error };
}

export async function recordInboundSms(options: {
  from: string;
  body: string;
  twilioSid?: string;
}): Promise<{ contact: CrmContact; interaction: CrmInteraction }> {
  const contact = await ensureContactForPhone(options.from);
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: contact.id,
    phone: contact.phone,
    channel: "sms",
    direction: "inbound",
    body: options.body,
    summary: "Inbound SMS",
    messageStatus: "received",
    twilioSid: options.twilioSid,
    actor: "customer",
    createdAt: now,
  };
  await appendInteraction(interaction);
  return { contact, interaction };
}

export async function recordBotSms(options: {
  contact: CrmContact;
  body: string;
  twilioSid?: string;
}): Promise<CrmInteraction> {
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: options.contact.id,
    phone: options.contact.phone,
    channel: "sms",
    direction: "outbound",
    body: options.body,
    summary: "SMS bot reply",
    messageStatus: options.twilioSid ? "sent" : "sent",
    twilioSid: options.twilioSid,
    actor: "bot",
    createdAt: now,
  };
  await appendInteraction(interaction);
  return interaction;
}

export async function recordOutboundCall(options: {
  contact: CrmContact;
  staffUserId?: string;
  staffName?: string;
  twilioSid?: string;
  summary?: string;
}): Promise<CrmInteraction> {
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: options.contact.id,
    phone: options.contact.phone,
    channel: "call",
    direction: "outbound",
    summary: options.summary || "Outbound call",
    callStatus: "queued",
    twilioSid: options.twilioSid,
    actor: "staff",
    staffUserId: options.staffUserId,
    staffName: options.staffName,
    createdAt: now,
  };
  await appendInteraction(interaction);
  return interaction;
}

export async function recordInboundCall(options: {
  from: string;
  twilioSid?: string;
}): Promise<{ contact: CrmContact; interaction: CrmInteraction }> {
  const contact = await ensureContactForPhone(options.from);
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: contact.id,
    phone: contact.phone,
    channel: "call",
    direction: "inbound",
    summary: "Inbound call",
    callStatus: "ringing",
    twilioSid: options.twilioSid,
    actor: "customer",
    createdAt: now,
  };
  await appendInteraction(interaction);
  return { contact, interaction };
}

export async function addCrmNote(options: {
  contactId: string;
  phone: string;
  text: string;
  staffUserId?: string;
  staffName?: string;
}): Promise<CrmInteraction> {
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: options.contactId,
    phone: crmPhoneDigits(options.phone),
    channel: "note",
    direction: "internal",
    body: options.text.trim(),
    summary: "Staff note",
    actor: "staff",
    staffUserId: options.staffUserId,
    staffName: options.staffName,
    createdAt: now,
  };
  await appendInteraction(interaction);
  return interaction;
}
