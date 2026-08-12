import "server-only";

import { normalizePhone } from "./normalize";
import { getLeadById, updateLeadFields } from "./store";
import type { Lead } from "./types";

export interface LeadDetailsPatch {
  phone?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  petName?: string;
  petSize?: string;
  pets?: { petName: string; petSize: string }[];
  service?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  followUpMode?: Lead["followUpMode"];
  visitOutcome?: Lead["visitOutcome"];
  listStatus?: Lead["listStatus"];
}

export function validateLeadDetailsPatch(
  patch: LeadDetailsPatch
): { ok: true } | { ok: false; error: string } {
  if (patch.phone !== undefined) {
    const digits = normalizePhone(patch.phone);
    if (digits.length > 0 && digits.length < 10) {
      return { ok: false, error: "Please enter a valid 10-digit phone number." };
    }
  }

  if (patch.zipCode !== undefined && patch.zipCode.trim()) {
    if (!/^\d{5}(-\d{4})?$/.test(patch.zipCode.trim())) {
      return { ok: false, error: "Please enter a valid ZIP code." };
    }
  }

  if (patch.email !== undefined && patch.email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email.trim())) {
      return { ok: false, error: "Please enter a valid email address." };
    }
  }

  return { ok: true };
}

async function syncLeadContactToMatchingAppointments(
  _lead: Lead,
  _actor: string
): Promise<void> {
  /* DermLounge has no appointment scheduling sync yet */
}

export async function patchLeadDetails(
  leadId: string,
  patch: LeadDetailsPatch,
  actor: string
): Promise<{ ok: true; lead: Lead } | { ok: false; error: string; status: number }> {
  const validation = validateLeadDetailsPatch(patch);
  if (!validation.ok) {
    return { ok: false, error: validation.error, status: 400 };
  }

  const normalizedPatch = { ...patch };
  if (patch.phone !== undefined) {
    normalizedPatch.phone = normalizePhone(patch.phone);
  }
  if (patch.email !== undefined) {
    normalizedPatch.email = patch.email.trim();
  }
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const first = patch.firstName?.trim() ?? "";
    const last = patch.lastName?.trim() ?? "";
    normalizedPatch.firstName = first;
    normalizedPatch.lastName = last;
  }

  if (patch.pets !== undefined) {
    normalizedPatch.pets = patch.pets
      .map((pet) => ({
        petName: pet.petName?.trim() ?? "",
        petSize: pet.petSize?.trim() ?? "medium",
      }))
      .filter((pet) => pet.petName || pet.petSize);
    if (normalizedPatch.pets.length > 0) {
      normalizedPatch.petName = normalizedPatch.pets[0].petName;
      normalizedPatch.petSize = normalizedPatch.pets[0].petSize;
    }
  }

  const lead = await updateLeadFields(leadId, {
    ...normalizedPatch,
    pets: normalizedPatch.pets,
    fullName:
      normalizedPatch.firstName !== undefined || normalizedPatch.lastName !== undefined
        ? [normalizedPatch.firstName, normalizedPatch.lastName].filter(Boolean).join(" ")
        : undefined,
  });
  if (!lead) {
    return { ok: false, error: "Lead not found", status: 404 };
  }

  await syncLeadContactToMatchingAppointments(lead, actor);
  const refreshed = (await getLeadById(leadId)) ?? lead;

  return { ok: true, lead: refreshed };
}
