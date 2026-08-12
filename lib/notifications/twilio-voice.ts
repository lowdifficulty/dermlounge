import "server-only";
import twilio from "twilio";
import {
  getTwilioClient,
  getTwilioStaffCallbackNumber,
  getTwilioVoiceCallerId,
} from "./twilio-client";
import { normalizePhoneE164 } from "./twilio";
import { resolveTwilioVoiceForward } from "./twilio-runtime-config";
import { crmPublicBaseUrl } from "@/lib/crm/public-url";

export type StartOutboundCallResult = {
  ok: boolean;
  sid?: string;
  error?: string;
};

/**
 * Click-to-call: Twilio dials the staff phone first, then bridges to the customer.
 * Staff number can be passed per-request or via TWILIO_STAFF_CALLBACK_NUMBER.
 */
export async function startOutboundBridgeCall(options: {
  customerPhone: string;
  staffPhone?: string;
  statusCallbackUrl: string;
  twimlUrl: string;
}): Promise<StartOutboundCallResult> {
  const client = await getTwilioClient();
  const callerId = await getTwilioVoiceCallerId();
  const staffPhone =
    normalizePhoneE164(options.staffPhone || "") ||
    normalizePhoneE164((await getTwilioStaffCallbackNumber()) || "");
  const customerPhone = normalizePhoneE164(options.customerPhone);

  if (!client || !callerId) {
    return { ok: false, error: "Twilio Voice is not configured" };
  }
  if (!staffPhone) {
    return {
      ok: false,
      error:
        "Staff callback number required — enter your cell in the dialer, or save Staff click-to-call phone under Admin → Phone & SMS.",
    };
  }
  if (!customerPhone) {
    return { ok: false, error: "Invalid customer phone number" };
  }
  if (staffPhone === callerId) {
    return {
      ok: false,
      error:
        "Staff callback cannot be the business Twilio number — use your cell phone so click-to-call can bridge correctly",
    };
  }
  if (customerPhone === callerId) {
    return { ok: false, error: "Cannot call the business line from the dialer" };
  }

  try {
    const call = await client.calls.create({
      to: staffPhone,
      from: callerId,
      url: `${options.twimlUrl}?customer=${encodeURIComponent(customerPhone)}`,
      statusCallback: options.statusCallbackUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });
    return { ok: true, sid: call.sid };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Call failed";
    console.error("Twilio outbound call failed:", error);
    return { ok: false, error };
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function voiceRecordingCallbackUrl(): Promise<string | null> {
  try {
    const base = await crmPublicBaseUrl();
    return `${base}/api/twilio/voice/recording`;
  } catch {
    return null;
  }
}

async function voiceTranscriptionCallbackUrl(): Promise<string | null> {
  try {
    const base = await crmPublicBaseUrl();
    return `${base}/api/twilio/voice/transcription`;
  } catch {
    return null;
  }
}

/** TwiML with realtime transcription + dual-channel recording on the bridged dial leg. */
async function buildRecordedDialTwiml(options: {
  dialNumber: string;
  callerId?: string;
  timeout: number;
  answerOnBridge?: boolean;
  statusCallbackUrl?: string;
  statusCallbackEvent?: string[];
}): Promise<string> {
  const recordingCallback = await voiceRecordingCallbackUrl();
  const transcriptionCallback = await voiceTranscriptionCallbackUrl();
  const callerId = options.callerId ? escapeXml(options.callerId) : "";
  const dialNumber = escapeXml(options.dialNumber);
  const answerOnBridge = options.answerOnBridge ? ' answerOnBridge="true"' : "";
  const recordingAttrs = recordingCallback
    ? ` record="record-from-answer-dual" recordingStatusCallback="${escapeXml(recordingCallback)}" recordingStatusCallbackEvent="completed" recordingStatusCallbackMethod="POST"`
    : "";
  const statusEvents = options.statusCallbackEvent?.length
    ? options.statusCallbackEvent.join(" ")
    : "initiated ringing answered completed";
  const statusAttrs = options.statusCallbackUrl
    ? ` statusCallback="${escapeXml(options.statusCallbackUrl)}" statusCallbackEvent="${escapeXml(statusEvents)}" statusCallbackMethod="POST"`
    : "";
  const startBlock = transcriptionCallback
    ? `<Start><Transcription statusCallbackUrl="${escapeXml(transcriptionCallback)}" track="both_tracks" languageCode="en-US" /></Start>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?><Response>${startBlock}<Dial callerId="${callerId}" timeout="${options.timeout}"${answerOnBridge}${recordingAttrs}${statusAttrs}><Number>${dialNumber}</Number></Dial></Response>`;
}

/** TwiML when staff places an outbound call from the browser Voice SDK. */
export async function buildClientOutboundTwiml(
  customerPhone: string,
  statusCallbackUrl?: string
): Promise<string> {
  const callerId = (await getTwilioVoiceCallerId()) || undefined;
  return buildRecordedDialTwiml({
    dialNumber: customerPhone,
    callerId,
    timeout: 45,
    answerOnBridge: true,
    statusCallbackUrl,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });
}

export async function buildBridgeTwiml(customerPhone: string): Promise<string> {
  const callerId = (await getTwilioVoiceCallerId()) || undefined;
  return buildRecordedDialTwiml({
    dialNumber: customerPhone,
    callerId,
    timeout: 45,
    answerOnBridge: true,
  });
}

async function resolveInboundForwardTarget(
  options?: { forwardTo?: string }
): Promise<string | null> {
  const callerId = normalizePhoneE164((await getTwilioVoiceCallerId()) || "");
  const candidates = [
    normalizePhoneE164(options?.forwardTo || ""),
    normalizePhoneE164((await getTwilioStaffCallbackNumber()) || ""),
    normalizePhoneE164((await resolveTwilioVoiceForward()) || ""),
  ].filter(Boolean) as string[];

  for (const phone of candidates) {
    if (phone !== callerId) return phone;
  }
  return null;
}

export async function buildInboundVoiceTwiml(options?: {
  forwardTo?: string;
}): Promise<string> {
  const forwardTo = await resolveInboundForwardTarget(options);
  const recordingCallback = await voiceRecordingCallbackUrl();
  const transcriptionCallback = await voiceTranscriptionCallbackUrl();
  const callerId = escapeXml((await getTwilioVoiceCallerId()) || "");

  if (!forwardTo) {
    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: "alice" },
      "Thank you for calling Mobile Dog Salon. Good dogs take baths."
    );
    response.say(
      { voice: "alice" },
      "We are unable to take your call right now. Please text this number or book online at mobile dog dash salon dot com slash book. Goodbye."
    );
    response.hangup();
    return response.toString();
  }

  const startBlock = transcriptionCallback
    ? `<Start><Transcription statusCallbackUrl="${escapeXml(transcriptionCallback)}" track="both_tracks" languageCode="en-US" /></Start>`
    : "";
  const recordingAttrs = recordingCallback
    ? ` record="record-from-answer-dual" recordingStatusCallback="${escapeXml(recordingCallback)}" recordingStatusCallbackEvent="completed" recordingStatusCallbackMethod="POST"`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Thank you for calling Mobile Dog Salon. Good dogs take baths.</Say><Say voice="alice">Please hold while we connect you.</Say>${startBlock}<Dial callerId="${callerId}" timeout="25"${recordingAttrs}><Number>${escapeXml(forwardTo)}</Number></Dial></Response>`;
}

export function mapTwilioCallStatus(
  status: string
):
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "no-answer"
  | "canceled"
  | "failed" {
  switch (status.toLowerCase()) {
    case "queued":
      return "queued";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in-progress";
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no-answer";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "failed";
  }
}
