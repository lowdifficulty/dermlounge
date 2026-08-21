import "server-only";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { assertWritablePersistence, isVercelServerless } from "@/lib/scheduling/persistence";
import { normalizePhone } from "./normalize";
import { DEFAULT_MEDICAL_SERVICE } from "@/lib/medical-services";
import {
  funnelStepOrder,
  type Lead,
  type LeadFunnelStep,
  type LeadNote,
  type LeadUpsertInput,
  type LeadsData,
} from "./types";

const FILE_PATH = path.join(process.cwd(), "data", "leads.json");
const REDIS_KEY = "dl:leads";
const READ_CACHE_MS = 15_000;

let readCache: { data: LeadsData; at: number } | null = null;

export function invalidateLeadsReadCache(): void {
  readCache = null;
}

export function emptyLeadsData(): LeadsData {
  return { leads: [] };
}

async function readFromLocalFile(): Promise<LeadsData> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as LeadsData;
    return { leads: parsed.leads ?? [] };
  } catch {
    return emptyLeadsData();
  }
}

async function writeToLocalFile(data: LeadsData): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function readLeadsData(): Promise<LeadsData> {
  if (readCache && Date.now() - readCache.at < READ_CACHE_MS) {
    return { leads: readCache.data.leads ?? [] };
  }

  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<LeadsData>(REDIS_KEY);
    if (data) {
      const normalized = { leads: data.leads ?? [] };
      readCache = { data: normalized, at: Date.now() };
      return normalized;
    }
    const empty = emptyLeadsData();
    await redis.set(REDIS_KEY, empty);
    readCache = { data: empty, at: Date.now() };
    return empty;
  }

  if (isVercelServerless()) {
    return emptyLeadsData();
  }

  return readFromLocalFile();
}

export async function writeLeadsData(data: LeadsData): Promise<void> {
  assertWritablePersistence();
  const normalized: LeadsData = { leads: data.leads ?? [] };
  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, normalized);
  } else {
    await writeToLocalFile(normalized);
  }
  invalidateLeadsReadCache();
}

function normalizeLeadName(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function leadNameFromInput(input: LeadUpsertInput): string {
  return (
    normalizeLeadName(input.fullName) ||
    normalizeLeadName([input.firstName, input.lastName].filter(Boolean).join(" "))
  );
}

function findLeadIndex(data: LeadsData, input: LeadUpsertInput): number {
  const phone = input.phone ? normalizePhone(input.phone) : "";
  if (phone.length >= 10) {
    const byPhone = data.leads.findIndex(
      (l) => normalizePhone(l.phone) === phone
    );
    if (byPhone >= 0) return byPhone;
  }

  const email = input.email?.trim().toLowerCase();
  if (email) {
    const byEmail = data.leads.findIndex(
      (l) => l.email?.trim().toLowerCase() === email
    );
    if (byEmail >= 0) return byEmail;
  }

  if (input.leadSessionId) {
    const bySession = data.leads.findIndex((l) => l.leadSessionId === input.leadSessionId);
    if (bySession >= 0) return bySession;
  }

  const name = leadNameFromInput(input);
  if (name && input.source === "meta") {
    const byName = data.leads.findIndex((l) => {
      const existing =
        normalizeLeadName(l.fullName) ||
        normalizeLeadName([l.firstName, l.lastName].filter(Boolean).join(" "));
      return existing === name;
    });
    if (byName >= 0) return byName;
  }

  if (input.appointmentId) {
    return data.leads.findIndex((l) => l.appointmentId === input.appointmentId);
  }

  return -1;
}

function mergeFunnelStep(
  current: LeadFunnelStep,
  incoming: LeadFunnelStep
): LeadFunnelStep {
  return funnelStepOrder(incoming) >= funnelStepOrder(current)
    ? incoming
    : current;
}

function splitFullName(fullName?: string): { firstName?: string; lastName?: string } {
  if (!fullName?.trim()) return {};
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function upsertLead(input: LeadUpsertInput): Promise<Lead> {
  const data = await readLeadsData();
  const now = new Date().toISOString();
  const phone = input.phone ? normalizePhone(input.phone) : "";
  const idx = findLeadIndex(data, input);
  const nameParts = splitFullName(input.fullName);

  if (idx >= 0) {
    const existing = data.leads[idx];
    const funnelStep = mergeFunnelStep(existing.funnelStep, input.funnelStep);
    const isNewBooking =
      input.funnelStep === "scheduled" && Boolean(input.appointmentId);
    const updated: Lead = {
      ...existing,
      leadSessionId: input.leadSessionId ?? existing.leadSessionId,
      phone: phone || existing.phone,
      funnelStep,
      followUpMode: isNewBooking
        ? "fu"
        : (input.followUpMode ?? existing.followUpMode ?? "fu"),
      firstName: input.firstName ?? nameParts.firstName ?? existing.firstName,
      lastName: input.lastName ?? nameParts.lastName ?? existing.lastName,
      fullName: input.fullName ?? existing.fullName,
      email: input.email?.trim() ?? existing.email,
      petName: input.petName ?? existing.petName,
      petSize: input.petSize ?? existing.petSize,
      pets: input.pets ?? existing.pets,
      service: input.service ?? existing.service,
      medicalService: input.medicalService ?? existing.medicalService ?? DEFAULT_MEDICAL_SERVICE,
      address: input.address ?? existing.address,
      city: input.city ?? existing.city,
      zipCode: input.zipCode ?? existing.zipCode,
      discountActive: input.discountActive ?? existing.discountActive,
      discountSkipped: input.discountSkipped ?? existing.discountSkipped,
      smsOptIn: input.smsOptIn ?? existing.smsOptIn,
      appointmentId: input.appointmentId ?? existing.appointmentId,
      scheduledAt: input.scheduledAt ?? existing.scheduledAt,
      appointmentStartAt: input.appointmentStartAt ?? existing.appointmentStartAt,
      groomerId: input.groomerId ?? existing.groomerId,
      groomerName: input.groomerName ?? existing.groomerName,
      source: input.source ?? existing.source,
      lastActiveAt: now,
      updatedAt: now,
    };
    data.leads[idx] = updated;
    await writeLeadsData(data);
    return updated;
  }

  const lead: Lead = {
    id: randomUUID(),
    leadSessionId: input.leadSessionId,
    phone,
    contactMadeAt: now,
    funnelStep: input.funnelStep,
    firstName: input.firstName ?? nameParts.firstName,
    lastName: input.lastName ?? nameParts.lastName,
    fullName: input.fullName,
    email: input.email?.trim(),
    petName: input.petName,
    petSize: input.petSize,
    pets: input.pets,
    service: input.service,
    medicalService: input.medicalService ?? DEFAULT_MEDICAL_SERVICE,
    address: input.address,
    city: input.city,
    zipCode: input.zipCode,
    discountActive: input.discountActive,
    discountSkipped: input.discountSkipped,
    smsOptIn: input.smsOptIn,
    appointmentId: input.appointmentId,
    scheduledAt: input.scheduledAt,
    appointmentStartAt: input.appointmentStartAt,
    groomerId: input.groomerId,
    groomerName: input.groomerName,
    followUpMode: "fu",
    listStatus: "active",
    notes: input.message
      ? [{ id: randomUUID(), text: input.message, createdAt: now }]
      : [],
    source: input.source ?? "booking",
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  };

  data.leads.push(lead);
  await writeLeadsData(data);
  return lead;
}

export async function updateLeadFields(
  leadId: string,
  patch: Partial<
    Pick<
      Lead,
      | "followUpMode"
      | "visitOutcome"
      | "visitOutcomeManual"
      | "listStatus"
      | "groomerId"
      | "groomerName"
      | "phone"
      | "firstName"
      | "lastName"
      | "fullName"
      | "email"
      | "petName"
      | "petSize"
      | "pets"
      | "service"
      | "address"
      | "city"
      | "zipCode"
    >
  >
): Promise<Lead | null> {
  const data = await readLeadsData();
  const index = data.leads.findIndex((l) => l.id === leadId);
  if (index === -1) return null;

  const lead = data.leads[index];
  if (patch.followUpMode !== undefined) {
    lead.followUpMode = patch.followUpMode;
  }
  if (patch.visitOutcome !== undefined) {
    lead.visitOutcome = patch.visitOutcome;
    lead.visitOutcomeManual = true;
  }
  if (patch.listStatus !== undefined) {
    lead.listStatus = patch.listStatus;
  }
  if (patch.groomerId !== undefined) {
    lead.groomerId = patch.groomerId;
  }
  if (patch.groomerName !== undefined) {
    lead.groomerName = patch.groomerName;
  }
  if (patch.phone !== undefined) {
    lead.phone = patch.phone;
  }
  if (patch.firstName !== undefined) {
    lead.firstName = patch.firstName;
  }
  if (patch.lastName !== undefined) {
    lead.lastName = patch.lastName;
  }
  if (patch.fullName !== undefined) {
    lead.fullName = patch.fullName;
  }
  if (patch.email !== undefined) {
    lead.email = patch.email;
  }
  if (patch.petName !== undefined) {
    lead.petName = patch.petName;
  }
  if (patch.petSize !== undefined) {
    lead.petSize = patch.petSize;
  }
  if (patch.pets !== undefined) {
    lead.pets = patch.pets;
    if (patch.pets.length > 0) {
      lead.petName = patch.pets[0].petName;
      lead.petSize = patch.pets[0].petSize;
    }
  }
  if (patch.service !== undefined) {
    lead.service = patch.service;
  }
  if (patch.address !== undefined) {
    lead.address = patch.address;
  }
  if (patch.city !== undefined) {
    lead.city = patch.city;
  }
  if (patch.zipCode !== undefined) {
    lead.zipCode = patch.zipCode;
  }

  if (patch.petName !== undefined || patch.petSize !== undefined) {
    const primaryPet = {
      petName: patch.petName ?? lead.petName ?? "",
      petSize: patch.petSize ?? lead.petSize ?? "",
    };
    const extraPets = (lead.pets ?? []).slice(1);
    lead.pets = primaryPet.petName || primaryPet.petSize
      ? [primaryPet, ...extraPets]
      : extraPets.length
        ? extraPets
        : undefined;
    lead.petName = primaryPet.petName;
    lead.petSize = primaryPet.petSize;
  }

  lead.updatedAt = new Date().toISOString();
  data.leads[index] = lead;
  await writeLeadsData(data);
  return lead;
}

export async function deleteLeadById(
  leadId: string
): Promise<{ lead: Lead; appointmentId?: string } | null> {
  const data = await readLeadsData();
  const index = data.leads.findIndex((l) => l.id === leadId);
  if (index === -1) return null;

  const [lead] = data.leads.splice(index, 1);
  await writeLeadsData(data);
  return { lead, appointmentId: lead.appointmentId };
}

export async function addLeadNote(leadId: string, text: string): Promise<Lead | null> {
  const data = await readLeadsData();
  const idx = data.leads.findIndex((l) => l.id === leadId);
  if (idx < 0) return null;

  const note: LeadNote = {
    id: randomUUID(),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  data.leads[idx] = {
    ...data.leads[idx],
    notes: [note, ...data.leads[idx].notes],
    updatedAt: note.createdAt,
  };

  await writeLeadsData(data);
  return data.leads[idx];
}

export async function getLeadByAppointmentId(
  appointmentId: string
): Promise<Lead | null> {
  const data = await readLeadsData();
  return data.leads.find((l) => l.appointmentId === appointmentId) ?? null;
}

export async function getLeadById(leadId: string): Promise<Lead | null> {
  const data = await readLeadsData();
  return data.leads.find((l) => l.id === leadId) ?? null;
}

export async function touchLeadActivity(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const data = await readLeadsData();
  const index = data.leads.findIndex((l) => l.leadSessionId === sessionId);
  if (index < 0) return;

  const now = new Date().toISOString();
  data.leads[index] = { ...data.leads[index], lastActiveAt: now };
  await writeLeadsData(data);
}
