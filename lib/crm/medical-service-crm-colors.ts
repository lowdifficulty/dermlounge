import type { MedicalServiceId } from "@/lib/medical-services";

type ServiceColorSet = {
  dot: string;
  active: string;
  avatar: string;
  rowAccent: string;
};

/** DermLounge palette: grey / white / black / matte red — extensible to 12 services. */
const SERVICE_COLORS: Partial<Record<MedicalServiceId, ServiceColorSet>> = {
  wound_care: {
    dot: "bg-accent",
    active: "bg-accent text-white",
    avatar: "bg-brand text-white",
    rowAccent: "border-l-2 border-l-accent/50",
  },
};

const DEFAULT: ServiceColorSet = {
  dot: "bg-gray-400",
  active: "bg-gray-800 text-white",
  avatar: "bg-gray-600 text-white",
  rowAccent: "border-l-2 border-l-gray-300",
};

function colorsFor(id?: MedicalServiceId | null): ServiceColorSet {
  if (id && SERVICE_COLORS[id]) return SERVICE_COLORS[id]!;
  return DEFAULT;
}

export function medicalServiceTabDotClass(id: MedicalServiceId): string {
  return colorsFor(id).dot;
}

export function medicalServiceTabActiveClass(id: MedicalServiceId): string {
  return colorsFor(id).active;
}

export function medicalServiceConversationAvatarClass(
  id: MedicalServiceId | null | undefined
): string {
  if (!id) return "bg-gray-200 text-gray-700";
  return colorsFor(id).avatar;
}

export function medicalServiceConversationRowClass(
  id: MedicalServiceId | null | undefined,
  active: boolean
): string {
  const base = active ? "bg-accent-light/60" : "hover:bg-gray-50";
  const accent = id ? colorsFor(id).rowAccent : "";
  return [base, accent].filter(Boolean).join(" ");
}
