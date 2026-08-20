import "server-only";
import { writeMetaRuntimeConfig } from "./config";
import { listMetaConversations } from "./client";
import { pageScopedParticipantId } from "./contacts";
import { importMetaHistoryMessage } from "./messaging";
import type { MetaPlatform } from "@/lib/crm/types";
import { resolveMetaPageId } from "./config";

export type MetaBackfillResult = {
  ok: boolean;
  error?: string;
  conversationsScanned: number;
  messagesImported: number;
  messagesSkipped: number;
  contactsLinked: number;
  contactsCreated: number;
};

export async function backfillMetaConversations(options?: {
  days?: number;
}): Promise<MetaBackfillResult> {
  const days = options?.days ?? 7;
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const pageId = await resolveMetaPageId();
  if (!pageId) {
    return {
      ok: false,
      error: "Meta page ID is not configured",
      conversationsScanned: 0,
      messagesImported: 0,
      messagesSkipped: 0,
      contactsLinked: 0,
      contactsCreated: 0,
    };
  }

  let messagesImported = 0;
  let messagesSkipped = 0;
  let contactsLinked = 0;
  let contactsCreated = 0;
  let conversationsScanned = 0;

  for (const platform of ["messenger", "instagram"] as const) {
    const listed = await listMetaConversations({
      platform,
      sinceUnix,
      limit: 100,
    });
    if (!listed.ok) {
      if (platform === "messenger") {
        return {
          ok: false,
          error: listed.error,
          conversationsScanned,
          messagesImported,
          messagesSkipped,
          contactsLinked,
          contactsCreated,
        };
      }
      continue;
    }

    for (const conversation of listed.conversations) {
      conversationsScanned++;
      const participant = pageScopedParticipantId(
        conversation.participants?.data,
        pageId
      );
      if (!participant) continue;

      const metaPlatform: MetaPlatform = platform === "instagram" ? "instagram" : "facebook";
      const messages = [...(conversation.messages?.data || [])].sort((a, b) =>
        (a.created_time || "").localeCompare(b.created_time || "")
      );

      for (const msg of messages) {
        const text = msg.message?.trim();
        if (!text) {
          messagesSkipped++;
          continue;
        }

        const msgTime = msg.created_time ? Date.parse(msg.created_time) : NaN;
        if (!Number.isNaN(msgTime) && msgTime < sinceUnix * 1000) {
          messagesSkipped++;
          continue;
        }

        const fromId = msg.from?.id;
        const isOutbound = fromId === pageId;
        const direction = isOutbound ? "outbound" : "inbound";

        const result = await importMetaHistoryMessage({
          psid: participant.psid,
          platform: metaPlatform,
          body: text,
          metaMessageId: msg.id,
          createdAt: msg.created_time,
          direction,
          actor: isOutbound ? "staff" : "customer",
          skipIfExists: true,
        });

        if (result.duplicate) {
          messagesSkipped++;
          continue;
        }

        messagesImported++;
        if (result.createdContact) contactsCreated++;
        else contactsLinked++;
      }
    }
  }

  await writeMetaRuntimeConfig({
    backfilledAt: new Date().toISOString(),
  });

  return {
    ok: true,
    conversationsScanned,
    messagesImported,
    messagesSkipped,
    contactsLinked,
    contactsCreated,
  };
}
