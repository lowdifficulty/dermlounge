import "server-only";
import OpenAI from "openai";
import { companyLegal } from "@/lib/company-legal";
import { readSchedulingData } from "@/lib/scheduling/store";
import { formatPhoneDisplay } from "@/lib/leads/normalize";
import {
  getMedicalService,
  medicalServiceContactUrl,
  resolveMedicalServiceId,
} from "@/lib/medical-services";
import type { CrmContact } from "./types";
import { recordBotSms } from "./messaging";
import {
  findContactById,
  listInteractionsForContact,
} from "./store";
import {
  phoneAllowedForSmsBot,
  readSmsBotConfig,
  type SmsBotConfig,
} from "./sms-bot-config";
import { runSmsBotActionFlow } from "./sms-bot-flow";
import { SMS_COMPLIANCE_KEYWORDS } from "@/lib/notifications/sms-compliance";

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function isSmsBotEnabled(): Promise<boolean> {
  if (process.env.SMS_BOT_ENABLED === "0" || process.env.SMS_BOT_ENABLED === "false") {
    return false;
  }
  const config = await readSmsBotConfig();
  return config.enabled;
}

async function contactLeadContext(contact: CrmContact): Promise<{
  serviceLabel: string;
  serviceId: string;
  contactUrl: string;
  upcomingVisit?: { startAt: string; service: string };
  isAbandonedLead: boolean;
}> {
  const serviceId = resolveMedicalServiceId(contact);
  const def = getMedicalService(serviceId);
  const contactUrl = medicalServiceContactUrl(serviceId, companyLegal.siteUrl);

  const { appointments } = await readSchedulingData();
  const mine = appointments.filter(
    (a) =>
      a.phone.replace(/\D/g, "").endsWith(contact.phone) ||
      contact.appointmentIds.includes(a.id)
  );
  const now = Date.now();
  const upcoming = mine
    .filter((a) => a.status === "confirmed" && new Date(a.startAt).getTime() >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];

  return {
    serviceLabel: def.label,
    serviceId,
    contactUrl,
    upcomingVisit: upcoming
      ? { startAt: upcoming.startAt, service: upcoming.service }
      : undefined,
    isAbandonedLead:
      contact.status === "lead" || contact.tags.includes("abandoned-funnel"),
  };
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ruleBasedReply(
  body: string,
  contact: CrmContact,
  ctx: Awaited<ReturnType<typeof contactLeadContext>>
): string {
  const text = body.trim().toLowerCase();
  const first = contact.firstName?.trim() || "there";
  const phone = companyLegal.businessPhoneDisplay || companyLegal.contactEmail;

  if (/^(hi|hello|hey)\b/.test(text)) {
    if (ctx.upcomingVisit) {
      return `Hi ${first}! This is My Derm Lounge. Your upcoming ${ctx.serviceLabel} visit is ${formatWhen(ctx.upcomingVisit.startAt)}. Reply STATUS for details or HELP for options.`;
    }
    return `Hi ${first}! Thanks for texting My Derm Lounge about ${ctx.serviceLabel}. Reply BOOK to schedule a consultation or call ${phone}.`;
  }

  if (/\b(status|when|appointment|appt|confirm)\b/.test(text)) {
    if (ctx.upcomingVisit) {
      return `You're scheduled: ${ctx.serviceLabel} on ${formatWhen(ctx.upcomingVisit.startAt)}. Questions? Call ${phone}. Reply STOP to opt out.`;
    }
    return `I don't see an upcoming visit on this number. Request a consultation: ${ctx.contactUrl}`;
  }

  if (/\b(book|schedule|consult|consultation|appointment|visit|callback)\b/.test(text)) {
    if (ctx.isAbandonedLead) {
      return `Happy to help you finish scheduling, ${first}! Start here: ${ctx.contactUrl} or call ${phone}.`;
    }
    return `Schedule ${ctx.serviceLabel} online: ${ctx.contactUrl} Our team can also call you back — reply YES to confirm.`;
  }

  if (/\b(price|cost|how much|insurance|coverage)\b/.test(text)) {
    return `Pricing and insurance for ${ctx.serviceLabel} vary by treatment plan. Request a consultation: ${ctx.contactUrl} or call ${phone}.`;
  }

  if (/\b(thanks|thank you|thx)\b/.test(text)) {
    return `You're welcome! We're here if you need anything. ${companyLegal.name}`;
  }

  if (ctx.upcomingVisit) {
    return `Thanks for your message! Your next visit is ${formatWhen(ctx.upcomingVisit.startAt)}. Reply STATUS or call ${phone}.`;
  }

  if (ctx.isAbandonedLead) {
    return `Still interested in ${ctx.serviceLabel}? We can help you book a consultation: ${ctx.contactUrl}`;
  }

  return `Thanks for texting ${companyLegal.name}! Reply BOOK to schedule, STATUS for visit info, HELP for help, or call ${phone}.`;
}

async function maybeAiPolish(
  inbound: string,
  contact: CrmContact,
  draft: string,
  ctx: Awaited<ReturnType<typeof contactLeadContext>>,
  config: SmsBotConfig
): Promise<string> {
  if (!config.useAiPolish) return draft;
  const openai = getOpenAI();
  if (!openai) return draft;

  const history = await listInteractionsForContact(contact.id, 8);
  const recent = history
    .filter((i) => i.channel === "sms" && i.body)
    .slice(-6)
    .map((i) => `${i.direction}/${i.actor}: ${i.body}`)
    .join("\n");

  const system = [
    config.systemPrompt,
    config.customLogic ? `\nAdditional logic from admin:\n${config.customLogic}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 180,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `Contact: ${contact.fullName || contact.phone} (${formatPhoneDisplay(contact.phone)})`,
            `Status: ${contact.status}`,
            `Service line: ${ctx.serviceLabel} (${ctx.serviceId})`,
            `Context: ${JSON.stringify(ctx)}`,
            `Recent thread:\n${recent || "(none)"}`,
            `Patient just said: ${inbound}`,
            `Draft reply: ${draft}`,
            `Return only the final SMS text.`,
          ].join("\n"),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text && text.length <= 480) return text;
  } catch (err) {
    console.error("SMS bot AI polish failed:", err);
  }
  return draft;
}

export type SmsBotHandleResult = {
  replied: boolean;
  body?: string;
  suppressed?: boolean;
  mode?: "test" | "live";
};

async function composeSmsBotReply(
  contact: CrmContact,
  inboundBody: string,
  config: SmsBotConfig
): Promise<string> {
  const fresh = (await findContactById(contact.id)) ?? contact;
  const ctx = await contactLeadContext(fresh);
  const actionResult = await runSmsBotActionFlow(fresh, inboundBody, config);
  if (actionResult) return actionResult.reply;

  const draft = ruleBasedReply(inboundBody, fresh, ctx);
  return maybeAiPolish(inboundBody, fresh, draft, ctx, config);
}

export async function handleInboundSmsWithBot(options: {
  contact: CrmContact;
  inboundBody: string;
  record?: boolean;
  forceSend?: boolean;
}): Promise<SmsBotHandleResult> {
  const config = await readSmsBotConfig();
  if (!config.enabled || options.contact.botEnabled === false) {
    return { replied: false, mode: config.mode };
  }

  const keyword = options.inboundBody.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (SMS_COMPLIANCE_KEYWORDS.has(keyword) && options.inboundBody.trim().split(/\s+/).length === 1) {
    return { replied: false, mode: config.mode };
  }

  const body = await composeSmsBotReply(options.contact, options.inboundBody, config);

  const allowed =
    options.forceSend || phoneAllowedForSmsBot(options.contact.phone, config);

  if (!allowed) {
    return { replied: false, body, suppressed: true, mode: config.mode };
  }

  if (options.record !== false) {
    await recordBotSms({ contact: options.contact, body });
  }

  return { replied: true, body, mode: config.mode };
}

export async function simulateSmsBotReply(options: {
  contact: CrmContact;
  inboundBody: string;
}): Promise<{ body: string; mode: "test" | "live"; draftOnly: boolean }> {
  const config = await readSmsBotConfig();
  const body = await composeSmsBotReply(options.contact, options.inboundBody, config);
  return {
    body,
    mode: config.mode,
    draftOnly: config.mode === "test",
  };
}
