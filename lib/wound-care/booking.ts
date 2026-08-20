import "server-only";
import { randomUUID } from "crypto";
import {
  woundDurationLabel,
  woundInsuranceLabel,
  woundSizeLabel,
} from "./labels";
import { findWoundCareSlot, isSameDayWoundCareBooking } from "./availability";
import { addWoundCareConsultation } from "./store";
import type { WoundCareBookInput, WoundCareConsultation } from "./types";
import { normalizePhone } from "@/lib/leads/normalize";
import { upsertLead } from "@/lib/leads/store";
import {
  appendInteraction,
  findContactByPhone,
  upsertContact,
} from "@/lib/crm/store";
import { crmPhoneE164, displayNameFromContact } from "@/lib/crm/phone";
import type { CrmContact } from "@/lib/crm/types";
import { getMedicalService } from "@/lib/medical-services";
import { sendSms } from "@/lib/notifications/twilio";

function validateInput(input: WoundCareBookInput): string | null {
  const digits = normalizePhone(input.phone);
  if (digits.length < 10) return "Enter a valid 10-digit phone number.";
  if (!input.slotKey?.trim()) return "Choose an appointment time.";
  return null;
}

async function syncCrmForConsultation(
  consultation: WoundCareConsultation
): Promise<CrmContact> {
  const digits = normalizePhone(consultation.phone);
  const def = getMedicalService("wound_care");
  const now = new Date().toISOString();
  let contact = await findContactByPhone(digits);

  if (contact) {
    const appointmentIds = Array.from(
      new Set([...(contact.appointmentIds ?? []), consultation.id])
    );
    contact = {
      ...contact,
      firstName: consultation.firstName.trim() || contact.firstName,
      lastName: consultation.lastName.trim() || contact.lastName,
      fullName: displayNameFromContact({
        firstName: consultation.firstName,
        lastName: consultation.lastName,
        phone: digits,
      }),
      phone: digits,
      phoneE164: crmPhoneE164(consultation.phone) ?? contact.phoneE164,
      smsOptIn: consultation.smsOptIn,
      medicalService: "wound_care",
      service: def.label,
      status: "appointment",
      appointmentIds,
      tags: Array.from(
        new Set([...(contact.tags ?? []), "wound-care", "woundcare-intake"])
      ),
      updatedAt: now,
      lastInteractionAt: now,
    };
  } else {
    contact = {
      id: randomUUID(),
      phone: digits,
      phoneE164: crmPhoneE164(consultation.phone) ?? `+1${digits}`,
      firstName: consultation.firstName.trim(),
      lastName: consultation.lastName.trim(),
      fullName: displayNameFromContact({
        firstName: consultation.firstName,
        lastName: consultation.lastName,
        phone: digits,
      }),
      pets: [],
      appointmentIds: [consultation.id],
      medicalService: "wound_care",
      service: def.label,
      smsOptIn: consultation.smsOptIn,
      status: "appointment",
      tags: ["wound-care", "woundcare-intake"],
      source: "heyflow",
      unreadCount: 0,
      botEnabled: true,
      createdAt: now,
      updatedAt: now,
      lastInteractionAt: now,
    };
  }

  const saved = await upsertContact(contact);

  const noteLines = [
    "Wound care consultation booked via /woundcare",
    `When: ${consultation.startAt}`,
  ];
  if (consultation.woundSize) {
    noteLines.push(`Wound size: ${woundSizeLabel(consultation.woundSize)}`);
  }
  if (consultation.woundDuration) {
    noteLines.push(`Duration: ${woundDurationLabel(consultation.woundDuration)}`);
  }
  if (consultation.priorTreatment) {
    noteLines.push(
      `Prior treatment: ${consultation.priorTreatment === "yes" ? "Yes" : "No"}`
    );
  }
  if (consultation.insurance) {
    noteLines.push(`Insurance: ${woundInsuranceLabel(consultation.insurance)}`);
  }

  await appendInteraction({
    id: randomUUID(),
    contactId: saved.id,
    phone: saved.phone,
    channel: "system",
    direction: "internal",
    actor: "system",
    body: noteLines.join("\n"),
    messageStatus: "delivered",
    createdAt: now,
  });

  return saved;
}

export async function bookWoundCareConsultation(
  input: WoundCareBookInput
): Promise<
  | {
      ok: true;
      consultation: WoundCareConsultation;
      displayDate: string;
      displayTime: string;
    }
  | { ok: false; error: string; status: number }
> {
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  const slot = await findWoundCareSlot(input.slotKey);
  if (!slot) {
    return {
      ok: false,
      error: "That time slot is no longer available. Please choose another.",
      status: 409,
    };
  }

  if (isSameDayWoundCareBooking(slot.date)) {
    return {
      ok: false,
      error: "Same-day appointments aren't available. Please choose a later date.",
      status: 409,
    };
  }

  let consultation: WoundCareConsultation;
  try {
    consultation = await addWoundCareConsultation({
      startAt: slot.startAt,
      slotKey: slot.slotKey,
      status: "confirmed",
      firstName: input.firstName?.trim() ?? "",
      lastName: input.lastName?.trim() ?? "",
      phone: normalizePhone(input.phone),
      smsOptIn: input.smsOptIn ?? true,
      ...(input.woundSize ? { woundSize: input.woundSize } : {}),
      ...(input.woundDuration ? { woundDuration: input.woundDuration } : {}),
      ...(input.priorTreatment ? { priorTreatment: input.priorTreatment } : {}),
      ...(input.insurance ? { insurance: input.insurance } : {}),
      source: "woundcare-intake",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to book that time slot.";
    return { ok: false, error: message, status: 409 };
  }

  const contact = await syncCrmForConsultation(consultation);

  const lead = await upsertLead({
    funnelStep: "scheduled",
    source: "heyflow",
    medicalService: "wound_care",
    service: "Wound care consultation",
    phone: consultation.phone,
    firstName: consultation.firstName,
    lastName: consultation.lastName,
    smsOptIn: consultation.smsOptIn,
    appointmentId: consultation.id,
    appointmentStartAt: consultation.startAt,
    scheduledAt: consultation.createdAt,
    message: [
      consultation.woundSize && `Wound size: ${woundSizeLabel(consultation.woundSize)}`,
      consultation.woundDuration &&
        `Duration: ${woundDurationLabel(consultation.woundDuration)}`,
      consultation.priorTreatment &&
        `Prior treatment: ${consultation.priorTreatment}`,
      consultation.insurance && `Insurance: ${woundInsuranceLabel(consultation.insurance)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  if (contact && !contact.leadId) {
    await upsertContact({ ...contact, leadId: lead.id });
  }

  const smsBody = `You're booked! Your DermLounge wound care consultation is scheduled for ${slot.displayDate} at ${slot.displayTime}. Reply STOP to opt out.`;
  if (consultation.smsOptIn) {
    await sendSms(consultation.phone, smsBody).catch((err) => {
      console.error("[wound-care/book] SMS failed:", err);
    });
  }

  return {
    ok: true,
    consultation,
    displayDate: slot.displayDate,
    displayTime: slot.displayTime,
  };
}
