import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "./redis-client";
import {
  assertWritablePersistence,
  isVercelServerless,
} from "./persistence";
import type { SchedulingData, WriteSchedulingMeta } from "./types";

const FILE_PATH = path.join(process.cwd(), "data", "scheduling.json");
const REDIS_KEY = "dl:scheduling";

export function emptySchedulingData(): SchedulingData {
  return { availability: [], appointments: [] };
}

async function readFromLocalFile(): Promise<SchedulingData> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as SchedulingData;
    return {
      availability: parsed.availability ?? [],
      appointments: parsed.appointments ?? [],
    };
  } catch {
    return emptySchedulingData();
  }
}

async function writeToLocalFile(data: SchedulingData): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function readSchedulingData(): Promise<SchedulingData> {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<SchedulingData>(REDIS_KEY);
    if (data) {
      return {
        availability: data.availability ?? [],
        appointments: data.appointments ?? [],
      };
    }
    return emptySchedulingData();
  }

  if (isVercelServerless()) {
    return emptySchedulingData();
  }

  return readFromLocalFile();
}

export async function writeSchedulingData(
  data: SchedulingData,
  _meta?: WriteSchedulingMeta
): Promise<void> {
  assertWritablePersistence();
  const normalized = {
    availability: data.availability ?? [],
    appointments: data.appointments ?? [],
  };
  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, normalized);
  } else {
    await writeToLocalFile(normalized);
  }
}
