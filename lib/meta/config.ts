import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { isVercelServerless } from "@/lib/scheduling/persistence";
import { companyLegal } from "@/lib/company-legal";

const FILE_PATH = path.join(process.cwd(), "data", "meta-config.json");
const REDIS_KEY = "dl:meta-config";

export const META_GRAPH_VERSION = "v21.0";
export const DEFAULT_META_VERIFY_TOKEN = "dermlounge-lead-webhook";

export interface MetaRuntimeConfig {
  pageId?: string;
  pageAccessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  /** When true, new Meta leads may receive an SMS. Keep false until the flow is approved. */
  autoSmsEnabled?: boolean;
  lastSyncAt?: string;
  lastSyncCount?: number;
  updatedAt?: string;
}

export function emptyMetaRuntimeConfig(): MetaRuntimeConfig {
  return {
    autoSmsEnabled: false,
  };
}

async function readFromLocalFile(): Promise<MetaRuntimeConfig> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return JSON.parse(raw) as MetaRuntimeConfig;
  } catch {
    return emptyMetaRuntimeConfig();
  }
}

async function writeToLocalFile(config: MetaRuntimeConfig): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export async function readMetaRuntimeConfig(): Promise<MetaRuntimeConfig> {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<MetaRuntimeConfig>(REDIS_KEY);
    if (data) return { ...emptyMetaRuntimeConfig(), ...data };
    const seeded = await readFromLocalFile();
    await redis.set(REDIS_KEY, seeded);
    return { ...emptyMetaRuntimeConfig(), ...seeded };
  }
  if (isVercelServerless()) return emptyMetaRuntimeConfig();
  return { ...emptyMetaRuntimeConfig(), ...(await readFromLocalFile()) };
}

export async function writeMetaRuntimeConfig(
  patch: Partial<MetaRuntimeConfig>
): Promise<MetaRuntimeConfig> {
  const current = await readMetaRuntimeConfig();
  const next: MetaRuntimeConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (typeof next.pageId === "string") next.pageId = next.pageId.trim();
  if (typeof next.pageAccessToken === "string") {
    next.pageAccessToken = next.pageAccessToken.trim();
  }
  if (typeof next.verifyToken === "string") next.verifyToken = next.verifyToken.trim();
  if (typeof next.appSecret === "string") next.appSecret = next.appSecret.trim();
  next.autoSmsEnabled = false;

  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, next);
  } else if (!isVercelServerless()) {
    await writeToLocalFile(next);
  } else {
    throw new Error("Meta config requires Redis in production");
  }

  return next;
}

export async function resolveMetaPageId(): Promise<string | null> {
  const env = process.env.META_PAGE_ID?.trim();
  if (env) return env;
  const cfg = await readMetaRuntimeConfig();
  return cfg.pageId?.trim() || null;
}

export async function resolveMetaPageAccessToken(): Promise<string | null> {
  const env = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (env) return env;
  const cfg = await readMetaRuntimeConfig();
  return cfg.pageAccessToken?.trim() || null;
}

export async function resolveMetaVerifyToken(): Promise<string> {
  const env = process.env.META_VERIFY_TOKEN?.trim();
  if (env) return env;
  const cfg = await readMetaRuntimeConfig();
  return cfg.verifyToken?.trim() || DEFAULT_META_VERIFY_TOKEN;
}

export async function resolveMetaAppSecret(): Promise<string | null> {
  const env = process.env.META_APP_SECRET?.trim();
  if (env) return env;
  const cfg = await readMetaRuntimeConfig();
  return cfg.appSecret?.trim() || null;
}

export async function isMetaAutoSmsEnabled(): Promise<boolean> {
  if (process.env.META_LEAD_AUTO_SMS === "1" || process.env.META_LEAD_AUTO_SMS === "true") {
    return true;
  }
  return false;
}

export function metaWebhookUrl(base = companyLegal.siteUrl): string {
  return `${base.replace(/\/$/, "")}/api/meta/leads`;
}

export function maskSecret(value?: string | null): string {
  const v = value?.trim() || "";
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
