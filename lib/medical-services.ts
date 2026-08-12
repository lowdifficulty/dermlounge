/**
 * Medical service lines under the My Derm Lounge brand.
 * Wound care is the active SMS/phone line today; schema supports up to 12 services.
 */

export type MedicalServiceId =
  | "wound_care"
  | "dermatology"
  | "medical_aesthetics"
  | "botox_fillers"
  | "laser_treatments"
  | "skin_cancer"
  | "acne_treatment"
  | "rosacea_treatment"
  | "hair_restoration"
  | "weight_loss"
  | "iv_therapy"
  | "zo_skin_health";

export const DEFAULT_MEDICAL_SERVICE: MedicalServiceId = "wound_care";

export type MedicalServiceDefinition = {
  id: MedicalServiceId;
  label: string;
  /** URL path on mydermlounge.com for booking / info */
  contactPath: string;
  /** CRM tag applied to contacts for this service line */
  crmTag: string;
  /** Whether this service line is live on the shared Twilio number today */
  smsActive: boolean;
};

export const MEDICAL_SERVICES: MedicalServiceDefinition[] = [
  {
    id: "wound_care",
    label: "Advanced Wound Care",
    contactPath: "/advanced-wound-care-services/",
    crmTag: "wound-care",
    smsActive: true,
  },
  {
    id: "dermatology",
    label: "General Dermatology",
    contactPath: "/contact-us/",
    crmTag: "dermatology",
    smsActive: false,
  },
  {
    id: "medical_aesthetics",
    label: "Medical Aesthetics",
    contactPath: "/contact-us/",
    crmTag: "medical-aesthetics",
    smsActive: false,
  },
  {
    id: "botox_fillers",
    label: "Botox & Fillers",
    contactPath: "/services/botox/",
    crmTag: "botox-fillers",
    smsActive: false,
  },
  {
    id: "laser_treatments",
    label: "Laser Treatments",
    contactPath: "/services/laser-treatments/",
    crmTag: "laser-treatments",
    smsActive: false,
  },
  {
    id: "skin_cancer",
    label: "Skin Cancer Care",
    contactPath: "/contact-us/",
    crmTag: "skin-cancer",
    smsActive: false,
  },
  {
    id: "acne_treatment",
    label: "Acne Treatment",
    contactPath: "/contact-us/",
    crmTag: "acne-treatment",
    smsActive: false,
  },
  {
    id: "rosacea_treatment",
    label: "Rosacea Treatment",
    contactPath: "/contact-us/",
    crmTag: "rosacea-treatment",
    smsActive: false,
  },
  {
    id: "hair_restoration",
    label: "Hair Restoration",
    contactPath: "/contact-us/",
    crmTag: "hair-restoration",
    smsActive: false,
  },
  {
    id: "weight_loss",
    label: "Medical Weight Loss",
    contactPath: "/services/weight-loss/",
    crmTag: "weight-loss",
    smsActive: false,
  },
  {
    id: "iv_therapy",
    label: "IV Therapy",
    contactPath: "/contact-us/",
    crmTag: "iv-therapy",
    smsActive: false,
  },
  {
    id: "zo_skin_health",
    label: "ZO Skin Health",
    contactPath: "/services/zo-skin-health/",
    crmTag: "zo-skin-health",
    smsActive: false,
  },
];

const BY_ID = new Map(MEDICAL_SERVICES.map((s) => [s.id, s]));

export function getMedicalService(id?: string | null): MedicalServiceDefinition {
  const key = (id?.trim() || DEFAULT_MEDICAL_SERVICE) as MedicalServiceId;
  return BY_ID.get(key) ?? BY_ID.get(DEFAULT_MEDICAL_SERVICE)!;
}

export function resolveMedicalServiceId(input?: {
  medicalService?: string | null;
  service?: string | null;
  tags?: string[];
}): MedicalServiceId {
  if (input?.medicalService && BY_ID.has(input.medicalService as MedicalServiceId)) {
    return input.medicalService as MedicalServiceId;
  }
  const serviceText = (input?.service || "").toLowerCase();
  if (serviceText.includes("wound")) return "wound_care";
  for (const def of MEDICAL_SERVICES) {
    if (input?.tags?.includes(def.crmTag)) return def.id;
  }
  return DEFAULT_MEDICAL_SERVICE;
}

export function medicalServiceContactUrl(
  id?: MedicalServiceId | null,
  siteUrl = "https://mydermlounge.com"
): string {
  const def = getMedicalService(id);
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${def.contactPath}`;
}

export function activeSmsMedicalServices(): MedicalServiceDefinition[] {
  return MEDICAL_SERVICES.filter((s) => s.smsActive);
}

/** Short label for CRM inbox tabs (e.g. "Wound Care" vs "Advanced Wound Care"). */
export function medicalServiceTabLabel(def: MedicalServiceDefinition): string {
  if (def.id === "wound_care") return "Wound Care";
  return def.label;
}

/** Service lines shown as CRM conversation inbox tabs today. */
export function crmConversationTabs(): MedicalServiceDefinition[] {
  return activeSmsMedicalServices();
}

export type CrmConversationViewId = "all" | MedicalServiceId;

export function isCrmConversationView(view: string): view is CrmConversationViewId {
  return view === "all" || BY_ID.has(view as MedicalServiceId);
}

export function crmConversationViewIds(): CrmConversationViewId[] {
  return ["all", ...MEDICAL_SERVICES.map((s) => s.id)];
}
