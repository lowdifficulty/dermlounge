import "server-only";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { assertWritablePersistence, isVercelServerless } from "@/lib/scheduling/persistence";
import type { CrmContact, CrmData, CrmInteraction, SmsBotSession } from "./types";
import { crmPhoneDigits } from "./phone";
import { isConversationVisibleInteraction } from "./conversation-filter";
import { normalizeCrmContactStatus } from "./pipeline";

function normalizeCrmRecord(data: CrmData): CrmData {
  return {
    contacts: (data.contacts ?? []).map((contact) => ({
      ...contact,
      status: normalizeCrmContactStatus(contact.status),
    })),
    interactions: data.interactions ?? [],
    seededAt: data.seededAt,
    version: data.version ?? CRM_DATA_VERSION,
  };
}

const FILE_PATH = path.join(process.cwd(), "data", "crm.json");
const REDIS_KEY = "dl:crm";
const READ_CACHE_MS = 10_000;
export const CRM_DATA_VERSION = 1;

let readCache: { data: CrmData; at: number } | null = null;

export function invalidateCrmReadCache(): void {
  readCache = null;
}

export function emptyCrmData(): CrmData {
  return { contacts: [], interactions: [], version: CRM_DATA_VERSION };
}

async function readFromLocalFile(): Promise<CrmData> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CrmData;
    return normalizeCrmRecord({
      contacts: parsed.contacts ?? [],
      interactions: parsed.interactions ?? [],
      seededAt: parsed.seededAt,
      version: parsed.version ?? CRM_DATA_VERSION,
    });
  } catch {
    return emptyCrmData();
  }
}

async function writeToLocalFile(data: CrmData): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function readCrmData(): Promise<CrmData> {
  if (readCache && Date.now() - readCache.at < READ_CACHE_MS) {
    return normalizeCrmRecord({
      contacts: readCache.data.contacts ?? [],
      interactions: readCache.data.interactions ?? [],
      seededAt: readCache.data.seededAt,
      version: readCache.data.version ?? CRM_DATA_VERSION,
    });
  }

  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<CrmData>(REDIS_KEY);
    if (data) {
      const normalized = normalizeCrmRecord({
        contacts: data.contacts ?? [],
        interactions: data.interactions ?? [],
        seededAt: data.seededAt,
        version: data.version ?? CRM_DATA_VERSION,
      });
      readCache = { data: normalized, at: Date.now() };
      return normalized;
    }
    const empty = emptyCrmData();
    readCache = { data: empty, at: Date.now() };
    return empty;
  }

  if (isVercelServerless()) {
    return emptyCrmData();
  }

  return readFromLocalFile();
}

export async function writeCrmData(data: CrmData): Promise<void> {
  assertWritablePersistence();
  const normalized = normalizeCrmRecord({
    contacts: data.contacts ?? [],
    interactions: data.interactions ?? [],
    seededAt: data.seededAt,
    version: data.version ?? CRM_DATA_VERSION,
  });
  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, normalized);
  } else {
    await writeToLocalFile(normalized);
  }
  invalidateCrmReadCache();
}

export async function findContactByPhone(phone: string): Promise<CrmContact | null> {
  const digits = crmPhoneDigits(phone);
  if (digits.length < 10) return null;
  const data = await readCrmData();
  return data.contacts.find((c) => c.phone === digits) ?? null;
}

export async function findContactById(id: string): Promise<CrmContact | null> {
  const data = await readCrmData();
  return data.contacts.find((c) => c.id === id) ?? null;
}

export async function upsertContact(
  contact: CrmContact,
  options?: { interaction?: CrmInteraction }
): Promise<CrmContact> {
  const data = await readCrmData();
  const idx = data.contacts.findIndex((c) => c.id === contact.id || c.phone === contact.phone);
  if (idx >= 0) {
    data.contacts[idx] = { ...data.contacts[idx], ...contact, id: data.contacts[idx].id };
  } else {
    data.contacts.push(contact);
  }
  if (options?.interaction) {
    data.interactions.push(options.interaction);
  }
  await writeCrmData(data);
  return idx >= 0 ? data.contacts[idx] : contact;
}

export async function appendInteraction(interaction: CrmInteraction): Promise<CrmInteraction> {
  const data = await readCrmData();
  data.interactions.push(interaction);

  const contactIdx = data.contacts.findIndex((c) => c.id === interaction.contactId);
  if (contactIdx >= 0) {
    const contact = data.contacts[contactIdx];
    contact.lastInteractionAt = interaction.createdAt;
    contact.updatedAt = interaction.createdAt;
    if (interaction.direction === "inbound") {
      contact.lastInboundAt = interaction.createdAt;
      if (interaction.channel === "sms" || interaction.channel === "call") {
        contact.unreadCount = (contact.unreadCount ?? 0) + 1;
      }
    }
    if (interaction.direction === "outbound") {
      contact.lastOutboundAt = interaction.createdAt;
    }
    data.contacts[contactIdx] = contact;
  }

  await writeCrmData(data);
  return interaction;
}

export async function updateInteraction(
  id: string,
  patch: Partial<CrmInteraction>
): Promise<CrmInteraction | null> {
  const data = await readCrmData();
  const idx = data.interactions.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  data.interactions[idx] = { ...data.interactions[idx], ...patch, id };
  await writeCrmData(data);
  return data.interactions[idx];
}

export async function markContactRead(contactId: string): Promise<void> {
  const data = await readCrmData();
  const idx = data.contacts.findIndex((c) => c.id === contactId);
  if (idx < 0) return;
  data.contacts[idx] = {
    ...data.contacts[idx],
    unreadCount: 0,
    updatedAt: new Date().toISOString(),
  };
  await writeCrmData(data);
}

export async function setContactBotEnabled(
  contactId: string,
  botEnabled: boolean
): Promise<CrmContact | null> {
  return patchContact(contactId, { botEnabled });
}

export async function patchContact(
  contactId: string,
  patch: Partial<CrmContact>
): Promise<CrmContact | null> {
  const data = await readCrmData();
  const idx = data.contacts.findIndex((c) => c.id === contactId);
  if (idx < 0) return null;
  const { id: _id, ...rest } = patch;
  data.contacts[idx] = {
    ...data.contacts[idx],
    ...rest,
    id: data.contacts[idx].id,
    updatedAt: new Date().toISOString(),
  };
  await writeCrmData(data);
  return data.contacts[idx];
}

export async function setContactSmsBotSession(
  contactId: string,
  session: SmsBotSession | null
): Promise<CrmContact | null> {
  const data = await readCrmData();
  const idx = data.contacts.findIndex((c) => c.id === contactId);
  if (idx < 0) return null;
  data.contacts[idx] = {
    ...data.contacts[idx],
    smsBotSession: session,
    updatedAt: new Date().toISOString(),
  };
  await writeCrmData(data);
  return data.contacts[idx];
}

export function newInteractionId(): string {
  return randomUUID();
}

export function newContactId(): string {
  return randomUUID();
}

export async function listInteractionsForContact(
  contactId: string,
  limit = 200
): Promise<CrmInteraction[]> {
  const data = await readCrmData();
  return data.interactions
    .filter((i) => i.contactId === contactId && isConversationVisibleInteraction(i))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit);
}

export async function listRecentInteractions(limit = 100): Promise<CrmInteraction[]> {
  const data = await readCrmData();
  return [...data.interactions]
    .filter(isConversationVisibleInteraction)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
