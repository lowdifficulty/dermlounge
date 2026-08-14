import type { CrmContactStatus } from "./types";

export const CRM_PIPELINE_STAGES = [
  "lead",
  "contact",
  "appointment",
  "patient",
  "follow_up",
  "cold",
] as const;

export type CrmPipelineStage = (typeof CRM_PIPELINE_STAGES)[number];

const LABELS: Record<CrmPipelineStage, string> = {
  lead: "Lead",
  contact: "Contact",
  appointment: "Appointment",
  patient: "Patient",
  follow_up: "Follow Up",
  cold: "Cold",
};

export function isCrmContactStatus(value: string | undefined | null): value is CrmContactStatus {
  return CRM_PIPELINE_STAGES.includes(value as CrmPipelineStage);
}

export function normalizeCrmContactStatus(
  value: string | undefined | null
): CrmContactStatus {
  if (value === "customer") return "patient";
  if (value === "inactive") return "cold";
  if (isCrmContactStatus(value)) return value;
  return "lead";
}

export function crmContactStatusLabel(status: string | undefined | null): string {
  return LABELS[normalizeCrmContactStatus(status)];
}

export function pipelineStatusAfterAppointment(
  current: string | undefined | null
): CrmContactStatus {
  const status = normalizeCrmContactStatus(current);
  if (status === "patient") return "patient";
  return "appointment";
}

export const CRM_PIPELINE_STAGE_OPTIONS = CRM_PIPELINE_STAGES.map((id) => ({
  id,
  label: LABELS[id],
}));

export function emptyPipelineCounts(): Record<CrmContactStatus, number> {
  return {
    lead: 0,
    contact: 0,
    appointment: 0,
    patient: 0,
    follow_up: 0,
    cold: 0,
  };
}
