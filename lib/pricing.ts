export const GROOMING_SERVICES = [
  { value: "consultation", label: "Consultation" },
  { value: "botox", label: "Botox" },
  { value: "fillers", label: "Dermal Fillers" },
  { value: "laser", label: "Laser Treatment" },
  { value: "facial", label: "Facial" },
  { value: "hydrafacial", label: "HydraFacial" },
  { value: "microneedling", label: "Microneedling" },
  { value: "skin-check", label: "Skin Check" },
  { value: "other", label: "Other" },
] as const;

export function getServiceLabel(service?: string | null): string {
  if (!service?.trim()) return "—";
  const match = GROOMING_SERVICES.find(
    (s) => s.value === service || s.label.toLowerCase() === service.toLowerCase()
  );
  return match?.label ?? service;
}
