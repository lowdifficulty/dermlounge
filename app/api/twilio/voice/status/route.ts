import { NextResponse } from "next/server";
import { findCallInteractionBySid } from "@/lib/crm/call-recordings";
import { readCrmData, updateInteraction } from "@/lib/crm/store";
import { mapTwilioCallStatus } from "@/lib/notifications/twilio-voice";

/** Twilio Voice status callback — updates CRM call interactions. */
export async function POST(request: Request) {
  const formData = await request.formData();
  const callSid = formData.get("CallSid")?.toString();
  const parentCallSid = formData.get("ParentCallSid")?.toString() || null;
  const dialCallSid = formData.get("DialCallSid")?.toString() || null;
  const callStatus = formData.get("CallStatus")?.toString() || "";
  const durationRaw = formData.get("CallDuration")?.toString();
  const durationSeconds = durationRaw ? Number(durationRaw) : undefined;

  if (callSid) {
    try {
      const data = await readCrmData();
      const existing = findCallInteractionBySid(data.interactions, callSid, parentCallSid);
      if (existing) {
        const patch: Parameters<typeof updateInteraction>[1] = {
          callStatus: mapTwilioCallStatus(callStatus),
          durationSeconds: Number.isFinite(durationSeconds)
            ? durationSeconds
            : existing.durationSeconds,
          summary: `Call ${callStatus}${durationSeconds ? ` (${durationSeconds}s)` : ""}`,
        };
        if (dialCallSid) {
          patch.metadata = {
            ...existing.metadata,
            dialCallSid,
            parentCallSid: parentCallSid || existing.metadata?.parentCallSid || null,
          };
        }
        await updateInteraction(existing.id, patch);
      }
    } catch (err) {
      console.error("Voice status CRM update failed:", err);
    }
  }

  return new NextResponse("ok", { status: 200 });
}
