import "server-only";
import type twilio from "twilio";
import {
  readTwilioRuntimeConfig,
  resolveTwilioWebhookBase,
  writeTwilioRuntimeConfig,
} from "@/lib/notifications/twilio-runtime-config";

const TWIML_APP_NAME = "Mobile Dog Salon Browser Dialer";

export async function ensureTwilioTwimlApp(client: twilio.Twilio): Promise<string> {
  const cfg = await readTwilioRuntimeConfig();
  const envSid = process.env.TWILIO_TWIML_APP_SID?.trim();
  if (envSid?.startsWith("AP")) return envSid;
  if (cfg.twimlAppSid?.startsWith("AP")) return cfg.twimlAppSid;

  const base = await resolveTwilioWebhookBase();
  if (!base) {
    throw new Error(
      "Public webhook base URL required for browser calling — set TWILIO_WEBHOOK_BASE_URL or save it under Admin → Phone & SMS"
    );
  }

  const voiceUrl = `${base}/api/twilio/voice/client`;
  const apps = await client.applications.list({ limit: 50 });
  const existing = apps.find((app) => app.friendlyName === TWIML_APP_NAME);

  let sid = existing?.sid;
  if (sid) {
    await client.applications(sid).update({
      voiceUrl,
      voiceMethod: "POST",
    });
  } else {
    const created = await client.applications.create({
      friendlyName: TWIML_APP_NAME,
      voiceUrl,
      voiceMethod: "POST",
    });
    sid = created.sid;
  }

  await writeTwilioRuntimeConfig({ twimlAppSid: sid });
  return sid;
}
