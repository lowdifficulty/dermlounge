import "server-only";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import {
  assertWritablePersistence,
  isVercelServerless,
} from "@/lib/scheduling/persistence";
import type { WoundCareConsultation } from "./types";

const FILE_PATH = path.join(process.cwd(), "data", "wound-care-consultations.json");
const REDIS_KEY = "dl:wound-care-consultations";

export interface WoundCareConsultationsData {
  consultations: WoundCareConsultation[];
}

export function emptyWoundCareConsultationsData(): WoundCareConsultationsData {
  return { consultations: [] };
}

async function readFromLocalFile(): Promise<WoundCareConsultationsData> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as WoundCareConsultationsData;
    return { consultations: parsed.consultations ?? [] };
  } catch {
    return emptyWoundCareConsultationsData();
  }
}

async function writeToLocalFile(data: WoundCareConsultationsData): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function readWoundCareConsultations(): Promise<WoundCareConsultation[]> {
  const data = await readWoundCareConsultationsData();
  return data.consultations;
}

export async function readWoundCareConsultationsData(): Promise<WoundCareConsultationsData> {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<WoundCareConsultationsData>(REDIS_KEY);
    if (data) {
      return { consultations: data.consultations ?? [] };
    }
    return emptyWoundCareConsultationsData();
  }

  if (isVercelServerless()) {
    return emptyWoundCareConsultationsData();
  }

  return readFromLocalFile();
}

export async function writeWoundCareConsultationsData(
  data: WoundCareConsultationsData
): Promise<void> {
  assertWritablePersistence();
  const normalized = { consultations: data.consultations ?? [] };
  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, normalized);
  } else {
    await writeToLocalFile(normalized);
  }
}

export async function addWoundCareConsultation(
  input: Omit<WoundCareConsultation, "id" | "createdAt">
): Promise<WoundCareConsultation> {
  const data = await readWoundCareConsultationsData();
  const duplicate = data.consultations.find(
    (c) => c.status === "confirmed" && c.slotKey === input.slotKey
  );
  if (duplicate) {
    throw new Error("That time slot is no longer available.");
  }

  const consultation: WoundCareConsultation = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  data.consultations.push(consultation);
  await writeWoundCareConsultationsData(data);
  return consultation;
}

export async function getWoundCareConsultationById(
  id: string
): Promise<WoundCareConsultation | null> {
  const data = await readWoundCareConsultationsData();
  return data.consultations.find((c) => c.id === id) ?? null;
}
