import { normalizePhone } from "@/lib/leads/normalize";

/** True for Meta-only contacts with a synthetic placeholder phone (8xxxxxxxx). */
export function isMetaOnlyPhone(phone: string): boolean {
  const digits = normalizePhone(phone);
  return digits.startsWith("8") && digits.length === 10;
}

export function metaContactLabel(platform?: string, hasPsid?: boolean): string {
  if (platform === "instagram") return "Instagram DM";
  if (hasPsid) return "Facebook DM";
  return "Meta DM";
}
