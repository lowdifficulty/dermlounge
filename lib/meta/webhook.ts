import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { resolveMetaAppSecret, resolveMetaVerifyToken } from "./config";

export async function metaWebhookChallenge(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !challenge) return null;
  const expected = await resolveMetaVerifyToken();
  if (!token || token !== expected) return null;
  return challenge;
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const secret = await resolveMetaAppSecret();
  if (!secret) {
    return true;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(actual, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type MetaLeadgenNotification = {
  leadgenId: string;
  pageId?: string;
  formId?: string;
};

export function parseLeadgenNotifications(payload: unknown): MetaLeadgenNotification[] {
  const body = payload as {
    object?: string;
    entry?: {
      id?: string;
      changes?: { field?: string; value?: { leadgen_id?: string; page_id?: string; form_id?: string } }[];
    }[];
  };
  if (body?.object && body.object !== "page") return [];
  const out: MetaLeadgenNotification[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "leadgen") continue;
      const id = change.value?.leadgen_id?.trim();
      if (!id) continue;
      out.push({
        leadgenId: id,
        pageId: change.value?.page_id || entry.id,
        formId: change.value?.form_id,
      });
    }
  }
  return out;
}
