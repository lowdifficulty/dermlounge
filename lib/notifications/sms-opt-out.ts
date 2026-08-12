import "server-only";
import { getRedisClient } from "@/lib/scheduling/redis-client";
import { normalizePhoneE164 } from "./twilio";

const OPT_OUT_KEY = "dl:sms-opt-outs";

export async function isSmsOptedOut(phone: string): Promise<boolean> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) return false;

  const redis = getRedisClient();
  if (!redis) return false;

  const blocked = await redis.sismember(OPT_OUT_KEY, e164);
  return Boolean(blocked);
}

export async function recordSmsOptOut(phone: string): Promise<void> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) return;

  const redis = getRedisClient();
  if (!redis) return;

  await redis.sadd(OPT_OUT_KEY, e164);
}

export async function recordSmsOptIn(phone: string): Promise<void> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) return;

  const redis = getRedisClient();
  if (!redis) return;

  await redis.srem(OPT_OUT_KEY, e164);
}
