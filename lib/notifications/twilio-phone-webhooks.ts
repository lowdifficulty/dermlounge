import "server-only";
import type twilio from "twilio";
import {
  resolveTwilioFromNumber,
  resolveTwilioWebhookBase,
} from "./twilio-runtime-config";
import { normalizePhoneE164 } from "./twilio";

export type TwilioPhoneWebhookStatus = {
  phoneNumber: string;
  phoneNumberSid: string;
  smsUrl: string | null;
  voiceUrl: string | null;
  smsConnected: boolean;
  voiceConnected: boolean;
  expectedSmsUrl: string;
  expectedVoiceUrl: string;
};

function normalizeWebhookUrl(url: string | null | undefined): string {
  return (url ?? "").trim().replace(/\/$/, "");
}

export async function expectedTwilioWebhookUrls(): Promise<{
  base: string;
  smsUrl: string;
  voiceUrl: string;
  voiceStatusUrl: string;
}> {
  const base =
    (await resolveTwilioWebhookBase())?.replace(/\/$/, "") ||
    "https://mydermlounge.com";
  return {
    base,
    smsUrl: `${base}/api/twilio/inbound`,
    voiceUrl: `${base}/api/twilio/voice`,
    voiceStatusUrl: `${base}/api/twilio/voice/status`,
  };
}

export async function inspectTwilioPhoneWebhooks(
  client: twilio.Twilio,
  fromNumber?: string | null
): Promise<TwilioPhoneWebhookStatus | null> {
  const target = normalizePhoneE164(fromNumber || (await resolveTwilioFromNumber()) || "");
  if (!target) return null;

  const expected = await expectedTwilioWebhookUrls();
  const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: target, limit: 1 });
  const record = numbers[0];
  if (!record) return null;

  const smsUrl = record.smsUrl || null;
  const voiceUrl = record.voiceUrl || null;

  return {
    phoneNumber: record.phoneNumber,
    phoneNumberSid: record.sid,
    smsUrl,
    voiceUrl,
    smsConnected: normalizeWebhookUrl(smsUrl) === normalizeWebhookUrl(expected.smsUrl),
    voiceConnected: normalizeWebhookUrl(voiceUrl) === normalizeWebhookUrl(expected.voiceUrl),
    expectedSmsUrl: expected.smsUrl,
    expectedVoiceUrl: expected.voiceUrl,
  };
}

export async function configureTwilioPhoneWebhooks(
  client: twilio.Twilio,
  fromNumber?: string | null
): Promise<{
  ok: boolean;
  status?: TwilioPhoneWebhookStatus;
  error?: string;
}> {
  const target = normalizePhoneE164(fromNumber || (await resolveTwilioFromNumber()) || "");
  if (!target) {
    return { ok: false, error: "From number is not configured" };
  }

  const expected = await expectedTwilioWebhookUrls();
  const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: target, limit: 1 });
  const record = numbers[0];
  if (!record) {
    return {
      ok: false,
      error: `No Twilio incoming phone number found for ${target}`,
    };
  }

  try {
    await client.incomingPhoneNumbers(record.sid).update({
      smsUrl: expected.smsUrl,
      smsMethod: "POST",
      smsApplicationSid: "",
      voiceUrl: expected.voiceUrl,
      voiceMethod: "POST",
      voiceApplicationSid: "",
      statusCallback: expected.voiceStatusUrl,
      statusCallbackMethod: "POST",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio update failed";
    return { ok: false, error: message };
  }

  const status = await inspectTwilioPhoneWebhooks(client, target);
  return { ok: true, status: status ?? undefined };
}
