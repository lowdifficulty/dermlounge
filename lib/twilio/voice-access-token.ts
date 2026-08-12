import "server-only";
import twilio from "twilio";
import { getTwilioClient } from "@/lib/notifications/twilio-client";
import { resolveTwilioAccountSid } from "@/lib/notifications/twilio-runtime-config";
import type { SessionUser } from "@/lib/scheduling/types";
import { ensureTwilioTwimlApp } from "./twiml-app";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

export function staffVoiceIdentity(user: SessionUser): string {
  const base = (user.email || user.name || "staff")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${user.role}-${base}`.slice(0, 64);
}

export type StaffVoiceTokenResult =
  | { ok: true; token: string; identity: string }
  | { ok: false; error: string };

export async function createStaffVoiceAccessToken(
  user: SessionUser
): Promise<StaffVoiceTokenResult> {
  const accountSid = await resolveTwilioAccountSid();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    return {
      ok: false,
      error:
        "Browser calling requires TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET (auth token alone is not enough)",
    };
  }

  const client = await getTwilioClient();
  if (!client) {
    return { ok: false, error: "Twilio is not configured" };
  }

  try {
    const twimlAppSid = await ensureTwilioTwimlApp(client);
    const identity = staffVoiceIdentity(user);
    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity,
      ttl: 3600,
    });
    const grant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: false,
    });
    token.addGrant(grant);
    return { ok: true, token: token.toJwt(), identity };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create voice token",
    };
  }
}
