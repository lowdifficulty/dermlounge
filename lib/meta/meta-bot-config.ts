import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { isVercelServerless } from "@/lib/scheduling/persistence";

const FILE_PATH = path.join(process.cwd(), "data", "meta-bot-config.json");
const REDIS_KEY = "dl:meta-bot-config";

export type MetaBotMode = "test" | "live";

export interface MetaBotConfig {
  mode: MetaBotMode;
  enabled: boolean;
  useAiPolish: boolean;
  systemPrompt: string;
  customLogic: string;
  /** PSIDs allowed when mode=test */
  testPsids: string[];
  updatedAt?: string;
}

export const DEFAULT_META_BOT_SYSTEM_PROMPT = `You are the My Derm Lounge Meta DM assistant (Facebook Messenger / Instagram). Write ONE short reply (max 1000 chars). Be warm, professional, and actionable. Never diagnose conditions or give medical advice — direct clinical questions to a consultation or phone call. Include ${process.env.NEXT_PUBLIC_SITE_URL || "https://mydermlounge.com"}/woundcare/ when booking is relevant. Do not use markdown.`;

export function emptyMetaBotConfig(): MetaBotConfig {
  return {
    mode: "test",
    enabled: true,
    useAiPolish: true,
    systemPrompt: DEFAULT_META_BOT_SYSTEM_PROMPT,
    customLogic: "",
    testPsids: [],
  };
}

async function readFromLocalFile(): Promise<Partial<MetaBotConfig> | null> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return JSON.parse(raw) as Partial<MetaBotConfig>;
  } catch {
    return null;
  }
}

async function writeToLocalFile(config: MetaBotConfig): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function normalizeConfig(input: Partial<MetaBotConfig>): MetaBotConfig {
  const base = emptyMetaBotConfig();
  return {
    mode: input.mode === "live" ? "live" : "test",
    enabled: input.enabled !== false,
    useAiPolish: input.useAiPolish !== false,
    systemPrompt: (input.systemPrompt || base.systemPrompt).trim(),
    customLogic: (input.customLogic || "").trim(),
    testPsids: Array.from(
      new Set((input.testPsids || []).map((p) => String(p).trim()).filter(Boolean))
    ),
    updatedAt: input.updatedAt,
  };
}

export async function readMetaBotConfig(): Promise<MetaBotConfig> {
  if (process.env.META_BOT_ENABLED === "0" || process.env.META_BOT_ENABLED === "false") {
    return { ...emptyMetaBotConfig(), enabled: false };
  }

  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<MetaBotConfig>(REDIS_KEY);
    if (data) return normalizeConfig(data);
    const seeded = normalizeConfig((await readFromLocalFile()) || {});
    await redis.set(REDIS_KEY, seeded);
    return seeded;
  }

  if (isVercelServerless()) return emptyMetaBotConfig();
  return normalizeConfig((await readFromLocalFile()) || {});
}

export async function writeMetaBotConfig(
  patch: Partial<MetaBotConfig>
): Promise<MetaBotConfig> {
  const current = await readMetaBotConfig();
  const next = normalizeConfig({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });

  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, next);
  } else if (!isVercelServerless()) {
    await writeToLocalFile(next);
  } else {
    throw new Error("Meta bot config requires Redis in production");
  }

  return next;
}

export function psidAllowedForMetaBot(psid: string, config: MetaBotConfig): boolean {
  if (!config.enabled) return false;
  if (config.mode === "live") return true;
  const needle = psid.trim();
  return config.testPsids.some((p) => p === needle);
}
