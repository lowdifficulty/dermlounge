import "server-only";
import {
  appendInteraction,
  findContactById,
  findContactByMetaPsid,
  newInteractionId,
  readCrmData,
  updateInteraction,
} from "@/lib/crm/store";
import type { CrmContact, CrmInteraction, MetaPlatform } from "@/lib/crm/types";
import { sendMetaTextMessage } from "./client";
import { resolveOrCreateMetaContact } from "./contacts";

async function findMetaInteractionByMessageId(
  metaMessageId: string
): Promise<CrmInteraction | null> {
  const data = await readCrmData();
  return (
    data.interactions.find(
      (ix) => ix.metadata?.metaMessageId === metaMessageId && ix.channel === "meta"
    ) ?? null
  );
}

export async function recordInboundMeta(options: {
  psid: string;
  platform: MetaPlatform;
  body: string;
  metaMessageId?: string;
  createdAt?: string;
  skipIfExists?: boolean;
}): Promise<{ contact: CrmContact; interaction: CrmInteraction; duplicate?: boolean; createdContact?: boolean }> {
  if (options.metaMessageId && options.skipIfExists) {
    const existing = await findMetaInteractionByMessageId(options.metaMessageId);
    if (existing) {
      const contact = (await findContactById(existing.contactId))!;
      return { contact, interaction: existing, duplicate: true };
    }
  }

  const hadContact = Boolean(await findContactByMetaPsid(options.psid));
  const contact = await resolveOrCreateMetaContact({
    psid: options.psid,
    platform: options.platform,
  });

  const now = options.createdAt || new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: contact.id,
    phone: contact.phone,
    channel: "meta",
    direction: "inbound",
    body: options.body,
    summary: options.platform === "instagram" ? "Instagram DM" : "Facebook DM",
    messageStatus: "received",
    actor: "customer",
    createdAt: now,
    metadata: {
      metaMessageId: options.metaMessageId || null,
      metaPlatform: options.platform,
      metaPsid: options.psid,
    },
  };
  await appendInteraction(interaction);
  return {
    contact,
    interaction,
    createdContact: !hadContact,
  };
}

export async function importMetaHistoryMessage(options: {
  psid: string;
  platform: MetaPlatform;
  body: string;
  metaMessageId?: string;
  createdAt?: string;
  direction: "inbound" | "outbound";
  actor?: "customer" | "staff" | "bot";
  skipIfExists?: boolean;
}): Promise<{
  contact: CrmContact;
  interaction: CrmInteraction;
  duplicate?: boolean;
  createdContact?: boolean;
}> {
  if (options.metaMessageId && options.skipIfExists) {
    const existing = await findMetaInteractionByMessageId(options.metaMessageId);
    if (existing) {
      const contact = (await findContactById(existing.contactId))!;
      return { contact, interaction: existing, duplicate: true };
    }
  }

  const hadContact = Boolean(await findContactByMetaPsid(options.psid));
  const contact = await resolveOrCreateMetaContact({
    psid: options.psid,
    platform: options.platform,
  });

  const now = options.createdAt || new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: contact.id,
    phone: contact.phone,
    channel: "meta",
    direction: options.direction,
    body: options.body,
    summary:
      options.direction === "inbound"
        ? options.platform === "instagram"
          ? "Instagram DM"
          : "Facebook DM"
        : "Meta DM",
    messageStatus: options.direction === "inbound" ? "received" : "sent",
    actor: options.actor || (options.direction === "inbound" ? "customer" : "staff"),
    createdAt: now,
    metadata: {
      metaMessageId: options.metaMessageId || null,
      metaPlatform: options.platform,
      metaPsid: options.psid,
      backfill: true,
    },
  };
  await appendInteraction(interaction);
  return {
    contact,
    interaction,
    createdContact: !hadContact,
  };
}

export async function sendStaffMetaDm(options: {
  contact: CrmContact;
  body: string;
  staffUserId?: string;
  staffName?: string;
}): Promise<{ ok: boolean; interaction?: CrmInteraction; error?: string }> {
  const psid = options.contact.metaPsid?.trim();
  if (!psid) return { ok: false, error: "This contact is not linked to Meta Messenger" };

  const text = options.body.trim();
  if (!text) return { ok: false, error: "Message body is required" };

  const result = await sendMetaTextMessage({ psid, text });
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: options.contact.id,
    phone: options.contact.phone,
    channel: "meta",
    direction: "outbound",
    body: text,
    summary: "Staff Meta DM",
    messageStatus: result.ok ? "sent" : "failed",
    actor: "staff",
    staffUserId: options.staffUserId,
    staffName: options.staffName,
    createdAt: now,
    metadata: {
      metaMessageId: result.messageId || null,
      metaPlatform: options.contact.metaPlatform || "facebook",
      metaPsid: psid,
      error: result.error || null,
    },
  };
  await appendInteraction(interaction);
  return { ok: result.ok, interaction, error: result.error };
}

export async function recordBotMetaDm(options: {
  contact: CrmContact;
  body: string;
  metaMessageId?: string;
  draftOnly?: boolean;
}): Promise<CrmInteraction> {
  const now = new Date().toISOString();
  const interaction: CrmInteraction = {
    id: newInteractionId(),
    contactId: options.contact.id,
    phone: options.contact.phone,
    channel: "meta",
    direction: "outbound",
    body: options.body,
    summary: options.draftOnly ? "Meta bot draft (not sent)" : "Meta bot reply",
    messageStatus: options.draftOnly ? "queued" : options.metaMessageId ? "sent" : "failed",
    actor: "bot",
    createdAt: now,
    metadata: {
      metaMessageId: options.metaMessageId || null,
      metaPlatform: options.contact.metaPlatform || "facebook",
      metaPsid: options.contact.metaPsid || null,
      suppressed: options.draftOnly ? true : null,
    },
  };
  await appendInteraction(interaction);
  return interaction;
}

export async function patchMetaInteractionStatus(
  metaMessageId: string,
  patch: Partial<CrmInteraction>
): Promise<CrmInteraction | null> {
  const existing = await findMetaInteractionByMessageId(metaMessageId);
  if (!existing) return null;
  return updateInteraction(existing.id, patch);
}
