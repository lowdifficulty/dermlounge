import "server-only";

import { companyLegal } from "@/lib/company-legal";
import {
  getMedicalService,
  medicalServiceContactUrl,
  resolveMedicalServiceId,
} from "@/lib/medical-services";
import type { CrmContact } from "./types";
import type { SmsBotConfig } from "./sms-bot-config";
import {
  buildSmsBotSession,
  clearSmsBotSession,
  isAffirmative,
  isNegative,
  saveSmsBotSession,
  smsBotSessionExpired,
} from "./sms-bot-session";

export type SmsBotFlowResult = {
  reply: string;
  actionTaken?: "consultation_prompt" | "session_cleared";
};

function consultationUrl(contact: CrmContact): string {
  const serviceId = resolveMedicalServiceId(contact);
  return medicalServiceContactUrl(serviceId, companyLegal.siteUrl);
}

async function startConsultationFlow(contact: CrmContact): Promise<SmsBotFlowResult> {
  const serviceId = resolveMedicalServiceId(contact);
  const def = getMedicalService(serviceId);
  const session = buildSmsBotSession("confirm_consultation", { service: serviceId });
  await saveSmsBotSession(contact, session);
  return {
    reply: `Ready to schedule a ${def.label} consultation? Reply YES and our team will follow up, or visit ${consultationUrl(contact)}`,
    actionTaken: "consultation_prompt",
  };
}

async function continueSession(
  contact: CrmContact,
  body: string
): Promise<SmsBotFlowResult | null> {
  const session = contact.smsBotSession;
  if (!session || smsBotSessionExpired(session)) {
    if (session) await clearSmsBotSession(contact);
    return null;
  }

  if (isNegative(body)) {
    await clearSmsBotSession(contact);
    return { reply: "No problem — nothing was changed.", actionTaken: "session_cleared" };
  }

  if (session.flow === "confirm_consultation") {
    if (!isAffirmative(body)) {
      return { reply: "Reply YES to request a consultation callback, or NO to stop." };
    }
    await clearSmsBotSession(contact);
    const def = getMedicalService(session.service);
    return {
      reply: `Thanks! A ${def.label} coordinator will reach out soon. Urgent questions? Call ${companyLegal.businessPhoneDisplay || companyLegal.contactEmail}.`,
      actionTaken: "consultation_prompt",
    };
  }

  return null;
}

function wantsSchedule(text: string): boolean {
  return /\b(book|schedule|appointment|consult|consultation|visit|callback)\b/.test(text);
}

/**
 * Lightweight multi-turn flows for medical lead follow-up (consultation request).
 * Returns null when no action flow handled the message.
 */
export async function runSmsBotActionFlow(
  contact: CrmContact,
  inboundBody: string,
  config: SmsBotConfig
): Promise<SmsBotFlowResult | null> {
  if (config.enableActions === false) return null;

  const body = inboundBody.trim();
  if (!body) return null;

  const continued = await continueSession(contact, body);
  if (continued) return continued;

  if (wantsSchedule(body.toLowerCase())) {
    return startConsultationFlow(contact);
  }

  return null;
}
