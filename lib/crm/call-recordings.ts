import "server-only";
import { readCrmData, updateInteraction } from "./store";
import type { CrmInteraction } from "./types";

export function findCallInteractionBySid(
  interactions: CrmInteraction[],
  callSid: string,
  parentCallSid?: string | null
): CrmInteraction | undefined {
  const candidates = [callSid, parentCallSid].filter(Boolean) as string[];
  return interactions.find(
    (i) =>
      i.channel === "call" &&
      (candidates.includes(i.twilioSid || "") ||
        candidates.includes(String(i.metadata?.parentCallSid || "")) ||
        candidates.includes(String(i.metadata?.dialCallSid || "")))
  );
}

export async function findCallInteraction(
  callSid: string,
  parentCallSid?: string | null
): Promise<CrmInteraction | null> {
  const data = await readCrmData();
  return findCallInteractionBySid(data.interactions, callSid, parentCallSid) ?? null;
}

export async function attachCallRecording(options: {
  callSid: string;
  parentCallSid?: string | null;
  recordingSid: string;
  recordingUrl: string;
  recordingChannels?: string;
  recordingDurationSeconds?: number;
}): Promise<CrmInteraction | null> {
  const existing = await findCallInteraction(options.callSid, options.parentCallSid);
  if (!existing) return null;

  const channels = options.recordingChannels || "dual";
  const duration =
    options.recordingDurationSeconds != null
      ? `${options.recordingDurationSeconds}s`
      : "";
  const summaryParts = ["Call recorded", channels === "dual" ? "(dual channel)" : "", duration]
    .filter(Boolean)
    .join(" ");

  return updateInteraction(existing.id, {
    recordingSid: options.recordingSid,
    recordingUrl: options.recordingUrl,
    recordingChannels: channels,
    summary: summaryParts,
    metadata: {
      ...existing.metadata,
      recordingCallSid: options.callSid,
      parentCallSid: options.parentCallSid || existing.metadata?.parentCallSid || null,
      recordingDurationSeconds: options.recordingDurationSeconds ?? null,
    },
  });
}

export async function attachCallTranscript(options: {
  recordingSid?: string;
  callSid?: string;
  transcript: string;
  transcriptionSid?: string;
}): Promise<CrmInteraction | null> {
  const data = await readCrmData();
  let existing = options.recordingSid
    ? data.interactions.find(
        (i) => i.channel === "call" && i.recordingSid === options.recordingSid
      )
    : undefined;
  if (!existing && options.callSid) {
    existing = findCallInteractionBySid(data.interactions, options.callSid);
  }
  if (!existing) return null;

  const text = options.transcript.trim();
  if (!text) return existing;

  return updateInteraction(existing.id, {
    transcript: text,
    body: text,
    transcriptionSid: options.transcriptionSid,
    summary: existing.summary?.includes("transcript")
      ? existing.summary
      : `${existing.summary || "Call"} · transcript ready`,
    metadata: {
      ...existing.metadata,
      transcriptionSid: options.transcriptionSid || null,
    },
  });
}
