import "server-only";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { GROOMERS } from "@/lib/scheduling/groomers";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { assertWritablePersistence } from "@/lib/scheduling/persistence";
import type { GroomerId } from "@/lib/scheduling/types";
import type {
  StaffTransfer,
  StaffTransferStatus,
  StaffTransferType,
} from "./types";

interface TransfersData {
  transfers: StaffTransfer[];
}

const FILE_PATH = path.join(process.cwd(), "data", "staff-transfers.json");
const REDIS_KEY = "mds:staff:transfers";

function emptyData(): TransfersData {
  return { transfers: [] };
}

async function readFromFile(): Promise<TransfersData> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as TransfersData;
    return { transfers: parsed.transfers ?? [] };
  } catch {
    return emptyData();
  }
}

async function writeToFile(data: TransfersData): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function readTransfersData(): Promise<TransfersData> {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<TransfersData>(REDIS_KEY);
    if (data) return { transfers: data.transfers ?? [] };
    const empty = emptyData();
    await redis.set(REDIS_KEY, empty);
    return empty;
  }

  if (process.env.VERCEL) {
    return emptyData();
  }

  return readFromFile();
}

export async function writeTransfersData(data: TransfersData): Promise<void> {
  assertWritablePersistence();
  const normalized: TransfersData = { transfers: data.transfers ?? [] };
  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, normalized);
  } else {
    await writeToFile(normalized);
  }
}

export async function createStaffTransfer(input: {
  type: StaffTransferType;
  leadId?: string;
  appointmentId?: string;
  fromName: string;
  fromGroomerId?: GroomerId;
  toGroomerId: GroomerId;
}): Promise<StaffTransfer> {
  const data = await readTransfersData();
  const now = new Date().toISOString();

  const transfer: StaffTransfer = {
    id: randomUUID(),
    type: input.type,
    leadId: input.leadId,
    appointmentId: input.appointmentId,
    fromName: input.fromName,
    fromGroomerId: input.fromGroomerId,
    toGroomerId: input.toGroomerId,
    status: "pending",
    createdAt: now,
  };

  data.transfers.push(transfer);
  await writeTransfersData(data);
  return transfer;
}

export async function listPendingTransfersForGroomer(
  groomerId: GroomerId
): Promise<StaffTransfer[]> {
  const data = await readTransfersData();
  return data.transfers
    .filter((t) => t.toGroomerId === groomerId && t.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getTransferById(id: string): Promise<StaffTransfer | null> {
  const data = await readTransfersData();
  return data.transfers.find((t) => t.id === id) ?? null;
}

export async function deleteTransfer(id: string): Promise<boolean> {
  const data = await readTransfersData();
  const index = data.transfers.findIndex((t) => t.id === id);
  if (index === -1) return false;
  data.transfers.splice(index, 1);
  await writeTransfersData(data);
  return true;
}

export async function resolveTransfer(
  id: string,
  groomerId: GroomerId,
  accept: boolean
): Promise<StaffTransfer | null> {
  const data = await readTransfersData();
  const index = data.transfers.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const transfer = data.transfers[index];
  if (transfer.toGroomerId !== groomerId || transfer.status !== "pending") {
    return null;
  }

  transfer.status = accept ? "accepted" : "declined";
  transfer.resolvedAt = new Date().toISOString();
  data.transfers[index] = transfer;
  await writeTransfersData(data);
  return transfer;
}

export function groomerDisplayName(id: GroomerId): string {
  return GROOMERS[id].name;
}
