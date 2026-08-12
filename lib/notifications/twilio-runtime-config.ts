import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { isVercelServerless } from "@/lib/scheduling/persistence";
import { normalizePhoneE164 } from "./twilio";

const FILE_PATH = path.join(process.cwd(), "data", "twilio-config.json");
const REDIS_KEY = "dl:twilio-config";

export interface TwilioRuntimeConfig {
  accountSid?: string;
  fromNumber?: string;
  voiceCallerId?: string;
  staffCallbackNumber?: string;
  voiceForwardNumber?: string;
  webhookBaseUrl?: string;
  /** TwiML App for browser dialer (Voice JS SDK). */
  twimlAppSid?: string;
  updatedAt?: string;
}

export function emptyTwilioRuntimeConfig(): TwilioRuntimeConfig {
  return {};
}

async function readFromLocalFile(): Promise<TwilioRuntimeConfig> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return JSON.parse(raw) as TwilioRuntimeConfig;
  } catch {
    return emptyTwilioRuntimeConfig();
  }
}

async function writeToLocalFile(config: TwilioRuntimeConfig): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export async function readTwilioRuntimeConfig(): Promise<TwilioRuntimeConfig> {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get<TwilioRuntimeConfig>(REDIS_KEY);
    if (data) return data;
    const seeded = await readFromLocalFile();
    await redis.set(REDIS_KEY, seeded);
    return seeded;
  }
  if (isVercelServerless()) return emptyTwilioRuntimeConfig();
  return readFromLocalFile();
}

export async function writeTwilioRuntimeConfig(
  patch: Partial<TwilioRuntimeConfig>
): Promise<TwilioRuntimeConfig> {
  const current = await readTwilioRuntimeConfig();
  const next: TwilioRuntimeConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (next.accountSid) {
    next.accountSid = next.accountSid.trim();
    if (next.accountSid && !next.accountSid.startsWith("AC")) {
      throw new Error("Account SID must start with AC");
    }
  }
  if (next.twimlAppSid) {
    next.twimlAppSid = next.twimlAppSid.trim();
    if (next.twimlAppSid && !next.twimlAppSid.startsWith("AP")) {
      throw new Error("TwiML App SID must start with AP");
    }
  }
  for (const key of ["fromNumber", "voiceCallerId", "staffCallbackNumber", "voiceForwardNumber"] as const) {
    if (next[key]) {
      const e164 = normalizePhoneE164(String(next[key]));
      if (!e164) throw new Error(`Invalid phone for ${key}`);
      next[key] = e164;
    }
  }

  const businessLine =
    next.fromNumber ||
    current.fromNumber ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    next.voiceCallerId ||
    current.voiceCallerId;
  for (const key of ["staffCallbackNumber", "voiceForwardNumber"] as const) {
    if (next[key] && businessLine && next[key] === businessLine) {
      throw new Error(
        `${key === "staffCallbackNumber" ? "Staff callback" : "Inbound forward"} must be a personal cell phone, not the business Twilio number (${businessLine})`
      );
    }
  }
  if (next.webhookBaseUrl) {
    next.webhookBaseUrl = next.webhookBaseUrl.trim().replace(/\/$/, "");
  }

  const redis = getRedisClient();
  if (redis) {
    await redis.set(REDIS_KEY, next);
  } else if (!isVercelServerless()) {
    await writeToLocalFile(next);
  } else {
    throw new Error("Twilio config requires Redis in production");
  }

  return next;
}

export async function resolveTwilioAccountSid(): Promise<string | null> {
  const env = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (env) return env;
  const cfg = await readTwilioRuntimeConfig();
  return cfg.accountSid?.trim() || null;
}

export async function resolveTwilioFromNumber(): Promise<string | null> {
  const env = process.env.TWILIO_FROM_NUMBER?.trim();
  if (env) return env;
  const cfg = await readTwilioRuntimeConfig();
  return cfg.fromNumber?.trim() || null;
}

export async function resolveTwilioVoiceCallerId(): Promise<string | null> {
  const env =
    process.env.TWILIO_VOICE_CALLER_ID?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim();
  if (env) return env;
  const cfg = await readTwilioRuntimeConfig();
  return cfg.voiceCallerId?.trim() || cfg.fromNumber?.trim() || null;
}

export async function resolveTwilioStaffCallback(): Promise<string | null> {
  const env = process.env.TWILIO_STAFF_CALLBACK_NUMBER?.trim();
  if (env) {
    const from = await resolveTwilioFromNumber();
    if (from && env === from) return null;
    return env;
  }
  const cfg = await readTwilioRuntimeConfig();
  const staff = cfg.staffCallbackNumber?.trim() || null;
  const from = await resolveTwilioFromNumber();
  if (staff && from && staff === from) return null;
  return staff;
}

export async function resolveTwilioVoiceForward(): Promise<string | null> {
  const env = process.env.TWILIO_VOICE_FORWARD_NUMBER?.trim();
  if (env) {
    const from = await resolveTwilioFromNumber();
    if (from && env === from) return null;
    return env;
  }
  const cfg = await readTwilioRuntimeConfig();
  const forward = cfg.voiceForwardNumber?.trim() || null;
  const from = await resolveTwilioFromNumber();
  if (forward && from && forward === from) return null;
  return forward;
}

export async function resolveTwilioWebhookBase(): Promise<string | null> {
  const env =
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim() ||
    process.env.QSTASH_CALLBACK_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const cfg = await readTwilioRuntimeConfig();
  return cfg.webhookBaseUrl?.trim().replace(/\/$/, "") || null;
}
