import "server-only";
import type { MetaPlatform } from "@/lib/crm/types";
import { ensureCrmSeeded } from "@/lib/crm/seed";
import { resolveMetaPageId, resolveMetaVerifyToken } from "./config";
import { handleInboundMetaWithBot } from "./bot";
import { recordInboundMeta } from "./messaging";
import { metaWebhookChallenge, verifyMetaSignature } from "./webhook";

type MetaWebhookMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
};

type MetaWebhookEntry = {
  id?: string;
  time?: number;
  messaging?: MetaWebhookMessaging[];
};

export async function verifyMetaMessagingWebhookChallenge(
  request: Request
): Promise<Response | null> {
  const challenge = await metaWebhookChallenge(request);
  if (challenge == null) return null;
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export { verifyMetaSignature as verifyMetaMessagingSignature };

function detectPlatform(entryPageId: string, recipientId?: string): MetaPlatform {
  if (recipientId && recipientId !== entryPageId) {
    return "instagram";
  }
  return "facebook";
}

export async function processMetaMessagingWebhookPayload(payload: {
  object?: string;
  entry?: MetaWebhookEntry[];
}): Promise<{ processed: number; skipped: number }> {
  if (payload.object !== "page" && payload.object !== "instagram") {
    return { processed: 0, skipped: 0 };
  }

  await ensureCrmSeeded();
  const pageId = (await resolveMetaPageId()) || "";

  let processed = 0;
  let skipped = 0;

  for (const entry of payload.entry || []) {
    const entryPageId = entry.id || pageId;
    for (const event of entry.messaging || []) {
      const message = event.message;
      if (!message?.text?.trim()) {
        skipped++;
        continue;
      }
      if (message.is_echo) {
        skipped++;
        continue;
      }

      const psid = event.sender?.id?.trim();
      if (!psid || psid === entryPageId) {
        skipped++;
        continue;
      }

      const platform = detectPlatform(entryPageId, event.recipient?.id);
      const createdAt = event.timestamp
        ? new Date(event.timestamp).toISOString()
        : undefined;

      try {
        const { contact, duplicate } = await recordInboundMeta({
          psid,
          platform,
          body: message.text.trim(),
          metaMessageId: message.mid,
          createdAt,
          skipIfExists: true,
        });

        if (duplicate) {
          skipped++;
          continue;
        }

        processed++;
        try {
          await handleInboundMetaWithBot({ contact, inboundBody: message.text.trim() });
        } catch (err) {
          console.error("Meta bot reply failed:", err);
        }
      } catch (err) {
        if (err instanceof Error && err.message === "meta_no_real_name") {
          skipped++;
          continue;
        }
        throw err;
      }
    }
  }

  return { processed, skipped };
}

export async function expectedMetaDmVerifyToken(): Promise<string> {
  return resolveMetaVerifyToken();
}
