import type {
  WoundDuration,
  WoundInsurance,
  WoundSize,
} from "./types";

export const WOUND_SIZE_OPTIONS: { id: WoundSize; label: string }[] = [
  { id: "0-1-inches", label: "0 - 1 inches" },
  { id: "1-2-inches", label: "1 - 2 inches" },
  { id: "2-3-inches", label: "2 - 3 inches" },
  { id: "3-plus-inches", label: "3+ inches" },
];

export const WOUND_DURATION_OPTIONS: { id: WoundDuration; label: string }[] = [
  { id: "less-than-30-days", label: "Less than 30 days" },
  { id: "1-3-months", label: "1–3 months" },
  { id: "3-6-months", label: "3–6 months" },
  { id: "more-than-6-months", label: "More than 6 months" },
];

export const WOUND_INSURANCE_OPTIONS: { id: WoundInsurance; label: string }[] = [
  { id: "medicare", label: "Medicare" },
  { id: "private", label: "Private Insurance" },
  { id: "none", label: "No Insurance" },
  { id: "other", label: "Other" },
];

export function woundSizeLabel(id: WoundSize | undefined): string {
  if (!id) return "Not provided";
  return WOUND_SIZE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function woundDurationLabel(id: WoundDuration | undefined): string {
  if (!id) return "Not provided";
  return WOUND_DURATION_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function woundInsuranceLabel(id: WoundInsurance | undefined): string {
  if (!id) return "Not provided";
  return WOUND_INSURANCE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}
