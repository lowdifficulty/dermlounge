import type { CrmInteraction } from "./types";

/** Hide synthetic or unsent outbound SMS from Conversations. */
export function isConversationVisibleInteraction(ix: CrmInteraction): boolean {
  if (ix.metadata?.suppressed === true) return false;

  const body = ix.body ?? "";
  if (body.includes("historical") || body.endsWith(" sent.")) return false;
  if (ix.summary?.toLowerCase().includes("not sent")) return false;

  if (ix.channel === "sms" && ix.direction === "outbound") {
    if (ix.actor === "bot") return true;
    return Boolean(ix.twilioSid?.trim());
  }

  return true;
}
