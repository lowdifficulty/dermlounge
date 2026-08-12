import "server-only";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  formatRequestLocation,
  getRequestClientInfo,
  type RequestClientInfo,
} from "@/lib/request-client-info";
import { getPersistenceMode } from "@/lib/scheduling/persistence";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import type { GroomerId, SessionUser } from "@/lib/scheduling/types";

export interface StaffLoginLogEntry {
  id: string;
  at: string;
  role: SessionUser["role"];
  email: string;
  name: string;
  groomerId?: GroomerId;
  loginIdentifier: string;
  ip: string | null;
  ipChain: string[];
  userAgent: string | null;
  acceptLanguage: string | null;
  referer: string | null;
  host: string | null;
  pathname: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  latitude: string | null;
  longitude: string | null;
  continent: string | null;
  locationLabel: string | null;
  clientHintsUa: string | null;
  clientHintsPlatform: string | null;
  clientHintsMobile: string | null;
}

const LOG_FILE = path.join(process.cwd(), "data", "staff-login-log.json");
const LOG_KEY = "dl:staff:login-log";
const MAX_ENTRIES = 500;

function entryFromClientInfo(
  user: SessionUser,
  loginIdentifier: string,
  client: RequestClientInfo
): StaffLoginLogEntry {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    role: user.role,
    email: user.email,
    name: user.name,
    groomerId: user.groomerId,
    loginIdentifier,
    ip: client.ip,
    ipChain: client.ipChain,
    userAgent: client.userAgent,
    acceptLanguage: client.acceptLanguage,
    referer: client.referer,
    host: client.host,
    pathname: client.pathname,
    city: client.city,
    region: client.region,
    country: client.country,
    timezone: client.timezone,
    latitude: client.latitude,
    longitude: client.longitude,
    continent: client.continent,
    locationLabel: formatRequestLocation(client),
    clientHintsUa: client.clientHintsUa,
    clientHintsPlatform: client.clientHintsPlatform,
    clientHintsMobile: client.clientHintsMobile,
  };
}

async function readFromFile(): Promise<StaffLoginLogEntry[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    const parsed = JSON.parse(raw) as StaffLoginLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeToFile(entries: StaffLoginLogEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.writeFile(LOG_FILE, JSON.stringify(entries, null, 2) + "\n", "utf8");
}

export function getStaffLoginLogPersistenceStatus(): {
  mode: ReturnType<typeof getPersistenceMode>;
  message: string;
} {
  const mode = getPersistenceMode();
  if (mode === "redis") {
    return {
      mode,
      message: "Login history is stored in Upstash Redis (persistent).",
    };
  }
  if (mode === "file") {
    return {
      mode,
      message: "Login history is stored in data/staff-login-log.json (local dev).",
    };
  }
  return {
    mode,
    message:
      "Login history is not persisted on this server without Redis. Add Upstash on Vercel to keep logs.",
  };
}

export async function readStaffLoginLog(): Promise<StaffLoginLogEntry[]> {
  const redis = getRedisClient();
  if (redis) {
    const entries = await redis.get<StaffLoginLogEntry[]>(LOG_KEY);
    return entries ?? [];
  }
  return readFromFile();
}

export async function appendStaffLoginLog(input: {
  user: SessionUser;
  loginIdentifier: string;
  request: Request;
}): Promise<StaffLoginLogEntry> {
  const client = getRequestClientInfo(input.request);
  const entry = entryFromClientInfo(input.user, input.loginIdentifier, client);

  const redis = getRedisClient();
  if (redis) {
    const existing = await readStaffLoginLog();
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    await redis.set(LOG_KEY, next);
    return entry;
  }

  if (getPersistenceMode() === "file") {
    const existing = await readFromFile();
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    await writeToFile(next);
  }

  return entry;
}
