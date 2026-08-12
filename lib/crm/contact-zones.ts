import { ALL_LA_COUNTY_CITIES, ALL_ORANGE_COUNTY_CITIES } from "@/lib/page-content";
import { normalizePhone } from "@/lib/leads/normalize";

export type ServiceZone = 1 | 2 | null;

const OC_ZIP_PREFIXES = ["926", "927", "928"];
const LA_ZIP_PREFIXES = ["906", "907", "908"];

const OC_CITY_HINTS = ALL_ORANGE_COUNTY_CITIES.map((c) => c.toLowerCase());
const LA_CITY_HINTS = [
  ...ALL_LA_COUNTY_CITIES.map((c) => c.toLowerCase()),
  "los angeles",
  "la county",
  "whittier",
  "long beach",
  "lakewood",
  "cerritos",
  "norwalk",
  "downey",
  "bellflower",
  "south gate",
  "carson",
  "torrance",
  "artesia",
  "hawaiian gardens",
  "la mirada",
  "signal hill",
];

function zipPrefix(zip?: string): string | null {
  const digits = (zip || "").replace(/\D/g, "");
  if (digits.length >= 3) return digits.slice(0, 3);
  return null;
}

function haystack(contact: {
  zipCode?: string;
  city?: string;
  address?: string;
}): string {
  return [contact.address, contact.city, contact.zipCode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** First 3 digits of a 10-digit US phone number. */
export function extractAreaCode(phone: string): string | null {
  const digits = normalizePhone(phone);
  if (digits.length >= 10) return digits.slice(0, 3);
  return null;
}

/** Zone 1 = Orange County, Zone 2 = LA / Whittier area, null = unknown. */
export function getContactServiceZone(contact: {
  zipCode?: string;
  city?: string;
  address?: string;
}): ServiceZone {
  const prefix = zipPrefix(contact.zipCode);
  if (prefix && OC_ZIP_PREFIXES.includes(prefix)) return 1;
  if (prefix && LA_ZIP_PREFIXES.includes(prefix)) return 2;

  const text = haystack(contact);
  if (
    text.includes("orange county") ||
    text.includes(" oc ") ||
    text.endsWith(" oc") ||
    OC_CITY_HINTS.some((city) => text.includes(city))
  ) {
    return 1;
  }
  if (
    text.includes("la county") ||
    text.includes("los angeles county") ||
    LA_CITY_HINTS.some((city) => text.includes(city))
  ) {
    return 2;
  }

  return null;
}

/** Sort rank for zones — unknown sorts last. */
export function zoneSortRank(zone: ServiceZone): number {
  if (zone === 1) return 0;
  if (zone === 2) return 1;
  return 2;
}
