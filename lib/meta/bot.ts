import "server-only";
import OpenAI from "openai";
import { companyLegal, legalRoutes } from "@/lib/company-legal";
import { readWoundCareConsultations } from "@/lib/wound-care/store";
import { crmPhoneDigits } from "@/lib/crm/phone";
import type { CrmContact } from "@/lib/crm/types";
import { listInteractionsForContact } from "@/lib/crm/store";
import {
  psidAllowedForMetaBot,
  readMetaBotConfig,
  type MetaBotConfig,
} from "./meta-bot-config";
import { sendMetaTextMessage } from "./client";
import { recordBotMetaDm } from "./messaging";

const WOUNDCARE_URL = `${companyLegal.siteUrl}/woundcare/`;
const CONTACT_URL = `${companyLegal.siteUrl}${legalRoutes.contact}`;

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function isMetaBotEnabled(): Promise<boolean> {
  if (process.env.META_BOT_ENABLED === "0" || process.env.META_BOT_ENABLED === "false") {
    return false;
  }
  const config = await readMetaBotConfig();
  return config.enabled;
}

async function contactConsultationContext(contact: CrmContact) {
  const digits = crmPhoneDigits(contact.phone);
  const consultations = await readWoundCareConsultations();
  const now = Date.now();
  const mine = consultations.filter(
    (c) => c.status === "confirmed" && crmPhoneDigits(c.phone) === digits
  );
  const upcoming = mine
    .filter((c) => new Date(c.startAt).getTime() >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  return upcoming
    ? {
        startAt: upcoming.startAt,
      }
    : null;
}

function buildDraftReply(contact: CrmContact, inboundBody: string): string {
  const name = contact.firstName || contact.fullName || "there";
  const lower = inboundBody.toLowerCase();
  if (/\b(book|schedule|appointment|consult)\b/.test(lower)) {
    return `Hi ${name}! You can request a wound care consultation here: ${WOUNDCARE_URL} — or call us at ${companyLegal.businessPhoneDisplay}.`;
  }
  if (/\b(price|cost|how much|insurance)\b/.test(lower)) {
    return `Hi ${name}! Wound care consults are personalized — book online at ${WOUNDCARE_URL} or call ${companyLegal.businessPhoneDisplay} and our team can help with next steps.`;
  }
  if (/\b(cancel|reschedule)\b/.test(lower)) {
    return `Hi ${name}! To change your consultation, please call ${companyLegal.businessPhoneDisplay} or message us here with your preferred date/time.`;
  }
  return `Hi ${name}! Thanks for messaging My Derm Lounge. Book a wound care consult: ${WOUNDCARE_URL} — How can we help today?`;
}

async function polishWithAi(
  draft: string,
  contact: CrmContact,
  inboundBody: string,
  config: MetaBotConfig
): Promise<string> {
  if (!config.useAiPolish) return draft;
  const openai = getOpenAI();
  if (!openai) return draft;

  const upcoming = await contactConsultationContext(contact);
  const history = (await listInteractionsForContact(contact.id, 8))
    .filter((ix) => ix.channel === "meta" && ix.body)
    .map((ix) => `${ix.direction}: ${ix.body}`)
    .join("\n");

  const system = [
    config.systemPrompt,
    config.customLogic,
    upcoming
      ? `Upcoming wound care consultation: ${upcoming.startAt}`
      : "No upcoming consultation on file.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Customer name: ${contact.fullName || contact.firstName || "Unknown"}\nRecent thread:\n${history}\n\nLatest inbound: ${inboundBody}\n\nDraft reply:\n${draft}`,
      },
    ],
    max_tokens: 220,
    temperature: 0.4,
  });

  return completion.choices[0]?.message?.content?.trim() || draft;
}

export async function simulateMetaBotReply(options: {
  contact: CrmContact;
  inboundBody: string;
}): Promise<{ body: string; mode: string; draftOnly: boolean }> {
  const config = await readMetaBotConfig();
  const draft = buildDraftReply(options.contact, options.inboundBody);
  const body = await polishWithAi(draft, options.contact, options.inboundBody, config);
  const allowed = options.contact.metaPsid
    ? psidAllowedForMetaBot(options.contact.metaPsid, config)
    : config.mode === "test";
  return {
    body,
    mode: config.mode,
    draftOnly: !allowed || !config.enabled,
  };
}

export async function handleInboundMetaWithBot(options: {
  contact: CrmContact;
  inboundBody: string;
}): Promise<{ replied: boolean; body?: string; draftOnly?: boolean }> {
  const config = await readMetaBotConfig();
  if (!config.enabled || !options.contact.botEnabled) {
    return { replied: false };
  }

  const psid = options.contact.metaPsid?.trim();
  if (!psid) return { replied: false };

  const allowed = psidAllowedForMetaBot(psid, config);
  const draft = buildDraftReply(options.contact, options.inboundBody);
  const body = await polishWithAi(draft, options.contact, options.inboundBody, config);

  if (!allowed) {
    await recordBotMetaDm({ contact: options.contact, body, draftOnly: true });
    return { replied: false, body, draftOnly: true };
  }

  const sent = await sendMetaTextMessage({ psid, text: body });
  await recordBotMetaDm({
    contact: options.contact,
    body,
    metaMessageId: sent.messageId,
    draftOnly: !sent.ok,
  });
  return { replied: sent.ok, body, draftOnly: !sent.ok };
}
