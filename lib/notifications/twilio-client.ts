import "server-only";
import twilio from "twilio";
import {
  readTwilioRuntimeConfig,
  resolveTwilioAccountSid,
  resolveTwilioFromNumber,
  resolveTwilioVoiceCallerId,
} from "./twilio-runtime-config";

export async function getTwilioClient(): Promise<twilio.Twilio | null> {
  const accountSid = await resolveTwilioAccountSid();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (accountSid && apiKeySid && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid });
  }
  if (accountSid && authToken) {
    return twilio(accountSid, authToken);
  }
  return null;
}

export async function getTwilioFromNumber(): Promise<string | null> {
  return resolveTwilioFromNumber();
}

export function getTwilioAuthToken(): string | null {
  return process.env.TWILIO_AUTH_TOKEN?.trim() || null;
}

export async function getTwilioVoiceCallerId(): Promise<string | null> {
  return resolveTwilioVoiceCallerId();
}

/** Staff phone that receives click-to-call bridge legs. */
export async function getTwilioStaffCallbackNumber(): Promise<string | null> {
  const { resolveTwilioStaffCallback } = await import("./twilio-runtime-config");
  return resolveTwilioStaffCallback();
}

export async function isTwilioConfigured(): Promise<boolean> {
  const client = await getTwilioClient();
  const from = await getTwilioFromNumber();
  return Boolean(client && from);
}

export async function twilioStatus(): Promise<{
  configured: boolean;
  hasFromNumber: boolean;
  hasVoice: boolean;
  hasAccountSid: boolean;
  hasApiKey: boolean;
  hasBrowserCalling: boolean;
  mode: "api-key" | "auth-token" | "missing";
  fromNumberMasked?: string;
  accountSidMasked?: string;
}> {
  const accountSid = await resolveTwilioAccountSid();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = await getTwilioFromNumber();
  const runtime = await readTwilioRuntimeConfig();

  let mode: "api-key" | "auth-token" | "missing" = "missing";
  if (accountSid && apiKeySid && apiKeySecret) mode = "api-key";
  else if (accountSid && authToken) mode = "auth-token";

  return {
    configured: mode !== "missing" && Boolean(from),
    hasFromNumber: Boolean(from),
    hasVoice: mode !== "missing" && Boolean(await getTwilioVoiceCallerId()),
    hasAccountSid: Boolean(accountSid),
    hasApiKey: Boolean(apiKeySid && apiKeySecret),
    hasBrowserCalling: Boolean(accountSid && apiKeySid && apiKeySecret),
    mode,
    fromNumberMasked: from ? `${from.slice(0, 2)}••••${from.slice(-4)}` : undefined,
    accountSidMasked: accountSid
      ? `${accountSid.slice(0, 4)}…${accountSid.slice(-4)}`
      : undefined,
    // expose whether runtime overrides exist without leaking secrets
    ...(runtime.updatedAt ? {} : {}),
  };
}
