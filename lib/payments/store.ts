import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { isVercelServerless } from "@/lib/scheduling/persistence";
import type { ClientAccount, ClientsData } from "./types";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

const FILE_PATH = path.join(process.cwd(), "data", "clients.json");
const TMP_PATH = path.join("/tmp", "dl-clients.json");
const REDIS_KEY = "dl:clients";

export function emptyClientsData(): ClientsData {
  return { clients: [] };
}

async function readFromFile(): Promise<ClientsData> {
  const paths = isVercelServerless() ? [TMP_PATH, FILE_PATH] : [FILE_PATH];
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p, "utf8");
      const parsed = JSON.parse(raw) as ClientsData;
      return { clients: parsed.clients ?? [] };
    } catch {
      // try next
    }
  }
  return emptyClientsData();
}

async function writeToFile(data: ClientsData): Promise<void> {
  const json = JSON.stringify(data, null, 2) + "\n";
  const target = isVercelServerless() ? TMP_PATH : FILE_PATH;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, json, "utf8");
}

export async function readClientsData(): Promise<ClientsData> {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<ClientsData>(REDIS_KEY);
    if (data) return data;
    const seeded = await readFromFile();
    await redis.set(REDIS_KEY, seeded);
    return seeded;
  }
  return readFromFile();
}

export async function writeClientsData(data: ClientsData): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, data);
    return;
  }
  await writeToFile(data);
}

export async function findClientByEmail(email: string): Promise<ClientAccount | null> {
  const data = await readClientsData();
  const normalized = email.trim().toLowerCase();
  return data.clients.find((c) => c.email.toLowerCase() === normalized) ?? null;
}

export async function findClientById(id: string): Promise<ClientAccount | null> {
  const data = await readClientsData();
  return data.clients.find((c) => c.id === id) ?? null;
}

export async function findClientByPhone(phone: string): Promise<ClientAccount | null> {
  const data = await readClientsData();
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return null;
  return data.clients.find((c) => normalizePhone(c.phone) === normalized) ?? null;
}

export async function findClientByIdentifier(
  identifier: string
): Promise<ClientAccount | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return findClientByEmail(trimmed);
  }
  return findClientByPhone(trimmed);
}

export async function updateClient(
  clientId: string,
  patch: Partial<
    Pick<
      ClientAccount,
      | "firstName"
      | "lastName"
      | "phone"
      | "email"
      | "lockedInDiscount"
      | "registrationComplete"
      | "appointmentIds"
      | "petProfile"
      | "pendingLickyWelcome"
      | "serviceAddress"
      | "pendingLickyBooking"
      | "squareCustomerId"
      | "stripeCustomerId"
    >
  >
): Promise<ClientAccount | null> {
  const data = await readClientsData();
  const index = data.clients.findIndex((c) => c.id === clientId);
  if (index < 0) return null;

  data.clients[index] = { ...data.clients[index], ...patch };
  await writeClientsData(data);
  return data.clients[index];
}

export async function createClient(account: ClientAccount): Promise<void> {
  const data = await readClientsData();
  data.clients.push(account);
  await writeClientsData(data);
}

export async function listClientSummaries(): Promise<
  Array<{ id: string; email: string; firstName: string; lastName: string }>
> {
  const data = await readClientsData();
  return data.clients.map((c) => ({
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
  }));
}
