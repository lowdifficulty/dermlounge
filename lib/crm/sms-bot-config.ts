import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { isVercelServerless } from "@/lib/scheduling/persistence";
import { crmPhoneDigits } from "./phone";

const FILE_PATH = path.join(process.cwd(), "data", "sms-bot-config.json");
const REDIS_KEY = "dl:sms-bot-config";

export type SmsBotMode = "test" | "live";

export interface SmsBotConfig {
  /** test = only reply to allowlisted phones; live = all opted-in contacts */
  mode: SmsBotMode;
  enabled: boolean;
  useAiPolish: boolean;
  systemPrompt: string;
  /** Extra logic / instructions appended into the bot prompt */
  customLogic: string;
  /** When true, SMS bot can book, cancel, and reschedule via multi-turn flows. */
  enableActions: boolean;
  /** Digits-only phones allowed when mode=test */
  testPhones: string[];
  updatedAt?: string;
}

export const DEFAULT_SMS_BOT_SYSTEM_PROMPT = `You are the My Derm Lounge SMS assistant for medical dermatology and wound care leads. Write ONE short SMS reply (max 320 chars). Be warm, professional, and HIPAA-aware — never diagnose, prescribe, or give specific medical advice. Direct urgent symptoms to call the clinic or 911. Include a consultation link when useful. If the draft is fine, return it lightly edited. Do not use markdown.`;

export function emptySmsBotConfig(): SmsBotConfig {
  return {
    mode: "test",
    enabled: true,
    useAiPolish: true,
    systemPrompt: DEFAULT_SMS_BOT_SYSTEM_PROMPT,
    customLogic: "",
    enableActions: true,
    testPhones: [],
  };
}

async function readFromLocalFile(): Promise<SmsBotConfig> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw) as Partial<SmsBotConfig>);
  } catch {
    return emptySmsBotConfig();
  }
}

async function writeToLocalFile(config: SmsBotConfig): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function normalizeConfig(input: Partial<SmsBotConfig>): SmsBotConfig {
  const base = emptySmsBotConfig();
  return {
    mode: input.mode === "live" ? "live" : "test",
    enabled: input.enabled !== false,
    useAiPolish: input.useAiPolish !== false,
    systemPrompt: (input.systemPrompt || base.systemPrompt).trim() || base.systemPrompt,
    customLogic: (input.customLogic || "").trim(),
    enableActions: input.enableActions !== false,
    testPhones: Array.from(
      new Set(
        (input.testPhones || [])
          .map((p) => crmPhoneDigits(String(p)))
          .filter((p) => p.length >= 10)
      )
    ),
    updatedAt: input.updatedAt,
  };
}

export async function readSmsBotConfig(): Promise<SmsBotConfig> {
  if (process.env.SMS_BOT_ENABLED === "0" || process.env.SMS_BOT_ENABLED === "false") {
    return { ...emptySmsBotConfig(), enabled: false };
  }

  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<SmsBotConfig>(REDIS_KEY);
    if (data) return normalizeConfig(data);
    const seeded = await readFromLocalFile();
    await redis.set(REDIS_KEY, seeded);
    return seeded;
  }

  if (isVercelServerless()) {
    return emptySmsBotConfig();
  }

  return readFromLocalFile();
}

export async function writeSmsBotConfig(
  patch: Partial<SmsBotConfig>
): Promise<SmsBotConfig> {
  const current = await readSmsBotConfig();
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
    throw new Error("SMS bot config requires Redis in production");
  }

  return next;
}

export function phoneAllowedForSmsBot(phone: string, config: SmsBotConfig): boolean {
  if (!config.enabled) return false;
  if (config.mode === "live") return true;
  const digits = crmPhoneDigits(phone);
  return config.testPhones.some((p) => digits.endsWith(p) || p.endsWith(digits));
}
