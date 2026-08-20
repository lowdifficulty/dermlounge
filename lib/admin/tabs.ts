export const ADMIN_TABS = [
  "crm",
  "contacts",
  "opportunities",
  "consultations",
  "people",
  "phoneSms",
  "metaAds",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export function parseAdminTab(value?: string | null): AdminTab {
  if (value && (ADMIN_TABS as readonly string[]).includes(value)) {
    return value as AdminTab;
  }
  return "crm";
}

export function adminTabHref(tab: AdminTab): string {
  if (tab === "metaAds") return "/admin/meta-ads/";
  if (tab === "crm") return "/admin/dashboard/";
  return `/admin/dashboard/?tab=${tab}`;
}
